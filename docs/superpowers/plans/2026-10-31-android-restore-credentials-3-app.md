# Android Restore Credentials (3/3: Catalyst-Native) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android の新しい端末でアプリを初めて起動したとき、何も操作せずにログイン済みになるようにする。

**Architecture:** Android 専用のローカル Expo モジュールが Credential Manager の Restore Credentials API を呼ぶ。`src/models/restore-credential.ts` がサーバーとのやりとり (登録・復元・削除) をまとめ、`credential.ts` の起動時の復元・ログイン・ログアウトから呼ぶ。失敗はすべて今までの流れ (未ログイン) に戻す。

**Tech Stack:** Expo Modules (Kotlin)、`androidx.credentials`、expo-secure-store、jest、Sentry

**Spec:** `docs/superpowers/specs/2026-10-31-android-restore-credentials-design.md`

**作業リポジトリ:** このリポジトリ (`apps/mobile`)。**前提:** サーバー側の対応がデプロイ済み、計画 2 の SDK beta がリリース済み。

## Global Constraints

- 対象は Android のみ。iOS / Web ではネイティブモジュールが `null` になり、すべて何もしない (`requireOptionalNativeModule`、既存の `src/models/image-downloader.ts` と同じ)
- `androidx.credentials:credentials` と `androidx.credentials:credentials-play-services-auth` は 1.5.0 以上
- `isAvailable()` は API 28 以上で `true`
- `CreateRestoreCredentialRequest` は `isCloudBackupEnabled = true`
- 復元 (`restore()`) 全体のタイムアウトは 5000 ms
- 鍵の作り直し間隔は 30 日
- 端末上の記録: SecureStore キー `restore_credential`、値は JSON `{ "credentialId": string, "registeredAt": string (ISO 8601) }`
- `NoCredentialException` (鍵なし) は Sentry に送らない。それ以外の失敗は `Sentry.captureException`
- サーバーが `invalid_grant` を返したら `clearAsync()` で端末上の鍵を消す (判定は `error instanceof OAuthError && error.info?.error === "invalid_grant"`)
- スタイルや UI の変更はない

## Review Focus

1. **起動時に、オフライン・サーバー障害で復元が終わらない** — 5 秒で諦めて未ログインで起動する。Task 2 にテストを置く。
2. **`tryRestore()` の後片付け (トークンの復元失敗) で鍵が消える** — 消えてはいけない。`logout()` は鍵に触らない。Task 3 にテストを置く。
3. **ログアウト時にサーバーへの削除が失敗する (オフライン)** — 端末側の鍵と記録は必ず消え、ログアウトは完了する。Task 2 にテストを置く。
4. **ログイン済みの起動のたびに登録が走る** — 記録が 30 日未満なら何もしない。Task 2 にテストを置く。
5. **iOS で新しいコードが呼ばれる** — ネイティブモジュールが `null` なら、`restore()` は `null`、他は何もしない。Task 2 にテストを置く。

---

### Task 1: ネイティブモジュール `catalyst-restore-credential`

**Files:**
- Create: `apps/mobile/modules/catalyst-restore-credential/expo-module.config.json` (`{ "platforms": ["android"], "android": { "modules": ["com.natsuneko.catalyst.restorecredential.CatalystRestoreCredentialModule"] } }`)
- Create: `apps/mobile/modules/catalyst-restore-credential/android/build.gradle` (`catalyst-downloader` と同じ形 + `dependencies` に 2 つの `androidx.credentials`)
- Create: `apps/mobile/modules/catalyst-restore-credential/android/src/main/java/com/natsuneko/catalyst/restorecredential/CatalystRestoreCredentialModule.kt`
- Create: `apps/mobile/src/models/restore-credential-module.ts`

**Interfaces:**
- Produces (`restore-credential-module.ts`):

```ts
export type CatalystRestoreCredentialModule = {
  isAvailable(): boolean;
  /** 登録結果 (RegistrationResponseJSON) の JSON 文字列を返す */
  createAsync(requestJson: string): Promise<string>;
  /** 認証結果 (AuthenticationResponseJSON) の JSON 文字列を返す。鍵がなければ null */
  getAsync(requestJson: string): Promise<string | null>;
  clearAsync(): Promise<void>;
};
export const CatalystRestoreCredential =
  requireOptionalNativeModule<CatalystRestoreCredentialModule>("CatalystRestoreCredential");
```

- [ ] **Step 1:** Kotlin モジュールを書く。`Name("CatalystRestoreCredential")`。`isAvailable` は `Function`、他は `AsyncFunction(...) Coroutine { }`。`CredentialManager.create(context)` を使い、`createCredential(activity, CreateRestoreCredentialRequest(requestJson, true))` の結果は `CreateRestoreCredentialResponse` の `responseJson`、`getCredential(activity, GetCredentialRequest(listOf(GetRestoreCredentialOption(requestJson))))` の結果は `RestoreCredential` の `authenticationResponseJson`、`NoCredentialException` は `null` を返す。`clearCredentialState(ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL))`。activity は `appContext.currentActivity ?: throw Exceptions.MissingActivity()`。
- [ ] **Step 2:** `cd apps/mobile && npx expo prebuild --platform android --no-install` のあと `cd android && ./gradlew :catalyst-restore-credential:compileDebugKotlin` が成功する (prebuild の生成物はコミットしない)
- [ ] **Step 3:** コミット: `feat(android): add native module for Restore Credentials`

### Task 2: `restore-credential.ts`

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog の `@natsuneko-laboratory/catalyst-sdk` を計画 2 の beta に更新) と `pnpm-lock.yaml`
- Create: `apps/mobile/src/models/restore-credential.ts`
- Test: `apps/mobile/src/models/restore-credential.test.ts`

**Interfaces:**
- Consumes: Task 1 の `CatalystRestoreCredential`、SDK の `OAuthError` / `Catalyst#oauth.getAccessTokenByRestoreCredential`、SDK facade の restore-credentials 操作 (`client.egeria.v1.restoreCredentials.registrationOptions.create()`、`client.egeria.v1.restoreCredentials.create({ body })`、`client.egeria.v1.restoreCredentials.authenticationOptions.create({ body: { client_id, client_secret } })`、`client.egeria.v1.restoreCredentials.credentialId.delete({ path: { credentialId } })`)、`CredentialStore.EMPTY_CREDENTIAL`、`API_KEY`
- Produces:
  - `restore(): Promise<{ accessToken: string; refreshToken: string } | null>`
  - `ensureRegistered(credential: CredentialStore.Credential): Promise<void>`
  - `unregister(credential: CredentialStore.Credential): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く** (`./restore-credential-module` と `expo-secure-store` と `@sentry/react-native` を `jest.mock` する。SDK は既存の `credential.test.ts` と同じく `jest.mock("@natsuneko-laboratory/catalyst-sdk")`)

```ts
describe("restore", () => {
  it("認証オプション → getAsync → grant の順に呼び、トークンを返す", async () => {});
  it("鍵がなければ (getAsync が null) null を返し、Sentry に送らない", async () => {});
  it("invalid_grant なら clearAsync を呼んで null を返す", async () => {});
  it("その他の失敗は Sentry に送って null を返す", async () => {});
  it("5000 ms 以内に終わらなければ null を返す", async () => { /* jest.useFakeTimers + advanceTimersByTime(5000) */ });
  it("ネイティブモジュールが null なら何も呼ばず null", async () => {});
});
describe("ensureRegistered", () => {
  it("記録がなければ登録し、記録を保存する", async () => {});
  it("記録が 30 日以上前なら作り直し、古い credentialId を DELETE する", async () => {});
  it("記録が 30 日未満なら何もしない", async () => {});
  it("失敗しても例外を投げない", async () => {});
});
describe("unregister", () => {
  it("サーバーの DELETE、clearAsync、記録の削除を行う", async () => {});
  it("サーバーの DELETE が失敗しても clearAsync と記録の削除は行う", async () => {});
  it("記録がなければ clearAsync だけ行う", async () => {});
});
```

- [ ] **Step 2:** `cd apps/mobile && pnpm test src/models/restore-credential.test.ts` → FAIL
- [ ] **Step 3:** 実装する。サーバー呼び出しは、`restore()` では `EMPTY_CREDENTIAL.client` (トークンなし) を、`ensureRegistered` / `unregister` では渡された `credential.client` を使う。認証オプションの取得には `client_id: API_KEY.clientId`、`client_secret: API_KEY.clientSecret` を送る。タイムアウトは `Promise.race` で 5000 ms。
- [ ] **Step 4:** 同じコマンドで PASS。`pnpm lint` も通る
- [ ] **Step 5:** コミット: `feat(auth): restore and register Android Restore Credentials`

### Task 3: `credential.ts` への組み込みと `signOut`

**Files:**
- Modify: `apps/mobile/src/models/credential.ts`
- Modify: `apps/mobile/src/app/settings/account.tsx:68`
- Modify: `apps/mobile/src/app/settings/account/delete.tsx:44`
- Test: `apps/mobile/src/models/credential.test.ts`

**Interfaces:**
- Consumes: Task 2 の `restore` / `ensureRegistered` / `unregister`
- Produces: `signOut(credential: CredentialStore.Credential): Promise<void>` (`unregister` → `logout()`)。`logout()` はトークンを消すだけで今と同じ

- [ ] **Step 1: 失敗するテストを書く** (`./restore-credential` を `jest.mock` する)

```ts
it("トークンがなければ RestoreCredential.restore を試し、成功すれば保存してログイン済みで返す", async () => {
  // getCredential: 1 回目は空、saveCredential 後の 2 回目は client 付き。restore → { accessToken: "ra", refreshToken: "rr" }
  // expect(mockedSaveCredential).toHaveBeenCalledWith({ accessToken: "ra", refreshToken: "rr" }); expect(result.isLoggedIn).toBe(true)
});
it("トークンがなく restore も null なら未ログインで返し、鍵には触らない", async () => {
  // expect(mockedUnregister).not.toHaveBeenCalled()
});
it("トークンがあれば restore を呼ばない", async () => {});
it("tryRestore と login が成功すると ensureRegistered を呼ぶ", async () => {});
it("logout は鍵に触らず、signOut は unregister を呼んでからトークンを消す", async () => {});
```

- [ ] **Step 2:** `cd apps/mobile && pnpm test src/models/credential.test.ts` → FAIL
- [ ] **Step 3:** 実装する。`tryRestore()` の冒頭で、`getCredential()` がトークンを返さなかったときだけ `restore()` を呼び、トークンが得られたら `saveCredential` してから `getCredential()` し直して、既存の `me` 取得の流れに合流させる。`ensureRegistered` は await せずに呼ぶ (`void ensureRegistered(credential)`)。
- [ ] **Step 4:** `account.tsx` と `account/delete.tsx` の `Credential.logout()` を `Credential.signOut(account.credential)` に置き換える (その時点の `account` から credential を渡す)。
- [ ] **Step 5:** テスト PASS、`pnpm lint` と `npx tsc --noEmit` が通る (`className` 由来の既知のエラーは対象外)
- [ ] **Step 6:** コミット: `feat(auth): restore sign-in on new Android devices`

### Task 4: 実機での確認

コードの変更なし。Play の内部テストトラックで配布したビルドを使う (debug 署名のビルドは混ぜない)。Google Play 開発者サービスが入った Android 9 以上の端末 2 台に、同じ Google アカウントを設定する。

- [ ] **Step 1:** 旧端末でログインし、しばらく待って鍵が登録されたこと (`POST /egeria/v1/restore-credentials` が成功したこと) を確認する。
- [ ] **Step 2:** 「設定 > Google > バックアップ > 今すぐバックアップ」または `adb shell bmgr backupnow --all` でバックアップする。
- [ ] **Step 3:** 新端末を初期化し、セットアップでクラウドから復元する。アプリを初めて起動し、何も操作せずにログイン済みになること。旧端末のセッションもそのまま使えること。
- [ ] **Step 4:** ケーブル・近くの端末からのコピーでも Step 3 と同じ結果になること。
- [ ] **Step 5:** 新端末でログアウトすると、その端末の鍵の削除 (`DELETE /egeria/v1/restore-credentials/{credentialId}`) が成功すること。
- [ ] **Step 6:** 連携アプリ画面で Catalyst を取り消したあと、別の端末で復元を試すと、未ログインで起動すること (`invalid_grant`)。
