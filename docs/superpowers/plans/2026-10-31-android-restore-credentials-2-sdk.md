# Android Restore Credentials (2/3: CatalystSDK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CatalystTS (`@natsuneko-laboratory/catalyst-sdk`) で、Restore Credentials の grant でトークンを取得でき、`/token` のエラーコードを呼び出し側が判別できるようにする。

**Architecture:** 生成コード (エンドポイントの facade) は、サーバー側のデプロイ後に `monitor.yml` が自動で再生成する。手書きの `OAuth` クラスにだけ、新しい grant のメソッドと、エラーレスポンスの `error` を `OAuthError.info` に載せる処理を足す。

**Tech Stack:** TypeScript (ESM)、vitest、archon

**Spec:** `docs/superpowers/specs/2026-10-31-android-restore-credentials-design.md` (Catalyst-Native リポジトリ)

**作業リポジトリ:** `~/ghq/github.com/mika-f/CatalystSDK` (`main` から新しいブランチを切る)。**前提:** サーバー側の対応が本番にデプロイ済み。

## Global Constraints

- grant_type: `urn:natsuneko:params:oauth:grant-type:restore_credential`
- 新しい grant は `client_id` と `client_secret` の両方を送る
- 生成ディレクトリは手で編集しない (`pnpm generate` で作る)
- Swift / Kotlin / .NET には追加しない (使うのは Android の React Native アプリだけ)

## Review Focus

1. **`/token` が 400 で JSON でない本文を返す** — `OAuthError("invalidTokenResponse")` のまま、`info` は undefined。Task 1 にテストを置く。
2. **400 の本文に `error` がない (既存クライアント向けの `message` だけ)** — `info` は undefined。Task 1 にテストを置く。
3. **既存の `getAccessTokenByRefreshToken` の失敗にも `info` が付く** — 挙動の追加だけで、例外の型と `kind` は変わらない。Task 1 にテストを置く。
4. **生成された facade に restore-credentials の 4 つの操作が出ない** — Task 2 の確認で検出する。
5. 該当なし (他に利用者が踏む入力はこの層にない)

---

### Task 1: `getAccessTokenByRestoreCredential` とエラー情報

**Files:**
- Modify: `packages/nodejs/src/oauth/oauth.ts`
- Test: `packages/nodejs/test/oauth.test.ts`

**Interfaces:**
- Produces:
  - `OAuth#getAccessTokenByRestoreCredential(credential: string): Promise<Token>` — `credential` は Android の認証結果 JSON 文字列をそのまま渡す
  - `postToken` は `!response.ok` のとき、本文が JSON で `error` が文字列なら `new OAuthError("Invalid token response", "invalidTokenResponse", { error, description: error_description, uri: error_uri })` を投げる。それ以外は今までどおり `info` なし

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("restoreCredentialGrantPostsCredential", async () => {
  let sent: URLSearchParams | undefined;
  const oauth = new OAuth("cid", "cs", {
    fetch: async (_input, init) => {
      sent = new URLSearchParams(String(init?.body));
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", token_type: "Bearer" }), { status: 200 });
    },
  });

  const token = await oauth.getAccessTokenByRestoreCredential('{"id":"x"}');

  expect(sent?.get("grant_type")).toBe("urn:natsuneko:params:oauth:grant-type:restore_credential");
  expect(sent?.get("client_id")).toBe("cid");
  expect(sent?.get("client_secret")).toBe("cs");
  expect(sent?.get("credential")).toBe('{"id":"x"}');
  expect(token.accessToken).toBe("at");
});

it("tokenErrorCarriesOAuthErrorCode", async () => {
  // 400 {"error":"invalid_grant","error_description":"..."} → thrown.info.error === "invalid_grant"、kind === "invalidTokenResponse"
});
it("tokenErrorWithoutErrorFieldHasNoInfo", async () => { /* 400 {"message":"x"} → info undefined */ });
it("tokenErrorWithNonJsonBodyHasNoInfo", async () => { /* 400 "oops" → info undefined */ });
it("refreshTokenErrorAlsoCarriesInfo", async () => { /* getAccessTokenByRefreshToken で 400 invalid_grant → info.error */ });
```

- [ ] **Step 2:** `pnpm --filter @natsuneko-laboratory/catalyst-sdk test` → FAIL
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** 同じコマンドで PASS
- [ ] **Step 5:** `packages/nodejs/README.md` の OAuth の節に、新しいメソッドを 1 行足す
- [ ] **Step 6:** コミット: `feat(nodejs): add restore credential grant and expose OAuth error codes`

### Task 2: 生成コードの確認とリリース

- [ ] **Step 1:** `monitor.yml` が新しい spec を取り込んだコミットを `main` に積んでいること (`git log origin/main --oneline -- openapi/openapi.json`)。まだなら、`gh workflow run monitor.yml` で手動実行する。
- [ ] **Step 2:** `grep -n "restoreCredentials" packages/nodejs/src/generated/facade.gen.ts` で、registration-options / 登録 / authentication-options / 削除 の 4 つの操作が出ていること。それぞれの facade 上の呼び出し名 (例: `egeria.v1.restoreCredentials.registrationOptions.post`) を控え、計画 3 の実装者に伝える。
- [ ] **Step 3:** Task 1 のブランチを PR にし、マージ後に beta をリリースする (`release.yml` は `main` から。手順は README の「How it works」)。リリースされたバージョン (`2026.x.y-beta.N`) を控える。
