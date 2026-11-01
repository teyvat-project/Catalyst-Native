# Android Restore Credentials によるゼロタップ再ログイン

- 日付: 2026-10-31
- 対象: CatalystSDK、Catalyst-Native (`apps/mobile`)。サーバー側の対応は別に行う
- 参考: [2027/4までに対応しないといけないRestore Credentials API調査 (Zenn)](https://zenn.dev/kinmemodoki/scraps/8cac900979d96a)

## 背景

Google Play は、ログイン機能を持つアプリに対して、ユーザーが新しい Android 端末へ移行したときにログイン状態を復元することを求める (2027 年 4 月から)。Block Store を 2026-09-30 までに本番導入していれば適合扱いになる経過措置があったが、すでに過ぎているので、Restore Credentials API で対応する。

現状のアプリは、トークンを `expo-secure-store` に保存している。`expo-secure-store` の config plugin が SecureStore の領域をクラウドバックアップと端末間転送の両方から除外しているので、新しい端末ではトークンがなく、`tryRestore()` は未ログインを返す。ユーザーは OAuth でログインし直す必要がある。

## ゴール

- Android の新しい端末でアプリを初めて起動したとき、何も操作せずにログイン済みになる。
- 復元に失敗しても、今までの流れ (未ログイン → OAuth でログイン) に戻るだけで、起動を妨げない。

## スコープ外

- iOS。キーチェーンの項目は `kSecAttrAccessibleWhenUnlocked` (ThisDeviceOnly ではない) で保存しているので、暗号化バックアップやクイックスタートで引き継がれる。
- バックアップ復元イベントのフック (BackupAgent)。初回起動時の復元だけにする。

## 決定事項

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| 鍵を登録する条件 | ログイン方法を問わず、OAuth ログインに成功したら登録する | アプリからは accounts でのログイン方法が見えない。鍵の強さは、そのセッションのリフレッシュトークンと同程度という扱いにする |
| 鍵の単位 | 利用者 × アプリ × 端末 | 連携アプリ画面の取り消し単位と揃える |
| 鍵の寿命 | 鍵には有効期限がある。アプリが 30 日ごとに鍵を作り直す | 使い続けている端末の鍵は常に期限内に保たれ、期限を延ばすエンドポイントが要らない |
| 取り消し | 連携アプリ画面でアプリを取り消すと、鍵もまとめて無効になる。アカウント削除でも無効になる | |
| トークン発行 | `/token` に新しい grant_type を追加する (方針 A) | 既存のトークン発行の流れをそのまま使え、入り口を増やさない |
| RP ID | `catalyst.natsuneko.com` | すでに本番の署名で `assetlinks.json` を配っている |

不採用にした案:

- 復元専用のエンドポイントでトークンを返す (方針 B): トークン発行の入り口が 2 つになり、クライアント認証などのチェックが重複する。
- Block Store にリフレッシュトークンを入れる: 経過措置の期限を過ぎていて、要件を満たせない。

## API (アプリから使うもの)

サーバー側の実装はこのリポジトリの範囲外。アプリは次の API を使う (いずれも OpenAPI に出ていて、SDK から呼べる)。

1. **`POST /egeria/v1/restore-credentials/registration-options`** (Bearer 認証)
   - 作成オプション (`PublicKeyCredentialCreationOptionsJSON`) を返す。`rp.id` は `catalyst.natsuneko.com`。
2. **`POST /egeria/v1/restore-credentials`** (Bearer 認証)
   - body は登録結果の JSON (`RegistrationResponseJSON`)。`{ credentialId }` を返す。
3. **`POST /egeria/v1/restore-credentials/authentication-options`** (利用者の認証なし)
   - body は `client_id` と `client_secret`。認証オプション (`PublicKeyCredentialRequestOptionsJSON`) を返す。
4. **`POST /token`** の `grant_type=urn:natsuneko:params:oauth:grant-type:restore_credential`
   - パラメータ: `client_id`、`client_secret`、`credential` (認証結果 `AuthenticationResponseJSON` の文字列)。
   - レスポンスは既存の grant と同じ形式。失敗したら、理由によらず `invalid_grant` を返す。
5. **`DELETE /egeria/v1/restore-credentials/{credentialId}`** (Bearer 認証)
   - 自分の鍵だけ削除できる。存在しなければ 404。

鍵には有効期限があり、連携アプリの取り消しやアカウント削除でも無効になる。`catalyst.natsuneko.com` の `/.well-known/assetlinks.json` は、`com.natsuneko.catalyst` に `delegate_permission/common.get_login_creds` を許可している。

## SDK (CatalystSDK)

OpenAPI から SDK を再生成し、次を使えるようにする。

- `egeria.v1.restoreCredentials` の registration-options / 登録 / 削除
- 認証オプションの取得
- `oauth` に新しい grant でトークンを取得するメソッド (`getAccessTokenByRestoreCredential(credential)` など)。レスポンスの扱いは `getAccessTokenByCode` と揃える。

## アプリ (Catalyst-Native)

### ネイティブモジュール

`apps/mobile/modules/catalyst-restore-credential` を作る (Android のみ、`catalyst-downloader` と同じ構成)。依存は `androidx.credentials:credentials` (1.5 以上) と `androidx.credentials:credentials-play-services-auth`。

| 関数 | 内容 |
| --- | --- |
| `isAvailable(): boolean` | API 28 以上なら `true` |
| `createAsync(requestJson: string): Promise<string>` | `CreateRestoreCredentialRequest(requestJson, isCloudBackupEnabled = true)` を呼び、登録結果の JSON を返す |
| `getAsync(requestJson: string): Promise<string \| null>` | `GetRestoreCredentialOption(requestJson)` で認証結果の JSON を返す。`NoCredentialException` なら `null` |
| `clearAsync(): Promise<void>` | `ClearCredentialStateRequest(TYPE_CLEAR_RESTORE_CREDENTIAL)` で端末上の鍵を消す |

iOS と Web では `requireOptionalNativeModule` が `null` を返すので、呼び出し側で何もしない (既存の `src/models/image-downloader.ts` と同じ)。

### `src/models/restore-credential.ts`

- **`restore(): Promise<{ accessToken; refreshToken } | null>`**
  - 認証オプションの取得 → `getAsync` → 新しい grant でトークンを取得、の順に進む。
  - 全体に約 5 秒のタイムアウトを付ける。どこかで失敗したら `null` を返す。
  - サーバーが `invalid_grant` を返したら、`clearAsync` で端末上の古い鍵を消す。
- **`ensureRegistered(credential): Promise<void>`**
  - 端末上の鍵の記録 `{ credentialId, registeredAt }` を SecureStore に持たせる。SecureStore はバックアップされないので、新しい端末では記録がない。
  - 記録がない、または `registeredAt` から 30 日以上経っていれば、registration-options → `createAsync` → 登録、の順に進め、記録を更新する。古い `credentialId` があれば `DELETE` する。
  - 呼び出し側は await しない。失敗しても何もしない (次回の起動でもう一度試す)。
- **`unregister(credential): Promise<void>`**
  - 記録の `credentialId` をサーバーで `DELETE` し、`clearAsync` を呼び、記録を消す。サーバーへの削除が失敗しても、端末側は必ず消す。

### `src/models/credential.ts` への組み込み

- `tryRestore()`: 保存済みのトークンがないときだけ `RestoreCredential.restore()` を試す。トークンが得られたら `saveCredential` で保存し、`me` を取得してログイン済みとして返す。
- `tryRestore()` と `login()` が成功したら、`ensureRegistered` をバックグラウンドで呼ぶ。
- `logout()` を 2 つに分ける:
  - `logout()`: トークンだけ消す (今のまま)。`tryRestore()` の後片付けで使う。ここで鍵を消すと、新しい端末で復元する前に鍵が消えてしまう。
  - `signOut(credential)`: 新しく作る。`unregister` を呼んでから `logout()` を呼ぶ。`app/settings/account.tsx` と `app/settings/account/delete.tsx` はこちらに切り替える。

### 設定

- 追加するネイティブ設定はない (RP ID はサーバーが返すオプションに入っている)。
- Auto Backup の設定 (SecureStore を除外する設定) は変えない。Restore Credentials の鍵は Google Play 開発者サービスが別にバックアップする。

## エラー処理

- 復元と登録まわりで何が失敗しても、今までの流れに戻すだけにする。アプリが落ちたり、起動が止まったりしないようにする。
- `NoCredentialException` は正常な結果として扱う。それ以外の失敗は Sentry に送る。
- サーバーの `invalid_grant` (期限切れや取り消し済み) では、端末上の鍵を消す。次回のログイン後に作り直される。

## テスト

- **CatalystSDK**: 再生成した SDK で、新しい grant と各エンドポイントの型が出ること。
- **Catalyst-Native**: `credential.test.ts` を拡張する (ネイティブモジュールはモックする)。
  - トークンがない → 復元に成功してログイン済みになる。
  - トークンがない → 復元に失敗して未ログインになる。
  - トークンがある → 復元を呼ばない。
  - `logout()` では鍵が消えず、`signOut()` では消えること。
- **実機テスト**: Play の内部テストトラックで配布したビルドを使う (鍵はパッケージ名と署名に紐づくため、debug 署名のビルドは混ぜない)。Google Play 開発者サービスが入った Android 9 以上の端末 2 台に、同じ Google アカウントを設定する。
  1. 旧端末でログインし、しばらく待って鍵が登録されたことを確認する。
  2. 「設定 > Google > バックアップ > 今すぐバックアップ」または `adb shell bmgr backupnow --all` でバックアップする。
  3. 新端末を初期化し、セットアップでクラウドから復元する。ケーブル・近くの端末からのコピーでも同じことを確認する。
  4. 新端末でアプリを初めて起動し、何も操作せずにログイン済みになることを確認する。
  5. ログアウトすると鍵が消えること、連携アプリ画面で取り消したあとは復元が失敗することを確認する。
  - アンインストール時に鍵は消えるので、同じ端末で入れ直すだけではこのフローは試せない。

## リリースの順番

1. サーバー: 上の API と `assetlinks.json`
2. CatalystSDK: 再生成してリリース
3. Catalyst-Native: SDK を更新し、ネイティブモジュールと組み込みを入れる

サーバーが先に出ていても、古いアプリは新しいエンドポイントを呼ばないので影響はない。
