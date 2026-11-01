import { API_KEY } from "@/constants/apikey";
import * as CredentialStore from "@/models/credential-store";
import { ensureRegistered, restore, unregister } from "@/models/restore-credential";
import type { EgeriaUser } from "@/models/sdk-types";
import { PKCE } from "@natsuneko-laboratory/catalyst-sdk";
import * as WebBrowser from "expo-web-browser";
import { v4 } from "uuid";

type AuthResult = {
  credential: CredentialStore.Credential;
  isLoggedIn: boolean;
  user: EgeriaUser | undefined;
};

/**
 * アプリ起動時に保存済みトークンからセッションを復元する。
 * OAuth フローは開始しない。
 */
export const tryRestore = async (): Promise<AuthResult> => {
  let credential = await CredentialStore.getCredential();

  // 保存済みトークンがないときだけ、Android の Restore Credentials から復元を試みる。
  // 復元できたトークンは、以降は保存済みトークンと同じ流れで検証する
  if (!credential.accessToken || !credential.refreshToken) {
    const restored = await restore();

    if (restored) {
      await CredentialStore.saveCredential({
        accessToken: restored.accessToken,
        refreshToken: restored.refreshToken,
      });
      credential = await CredentialStore.getCredential();
    }
  }

  if (credential.accessToken && credential.refreshToken) {
    try {
      const { data: me } = await credential.client.egeria.v1.me.get({
        throwOnError: true,
      });

      if (me?.user) {
        // 鍵の登録は待たない (失敗しても次回起動時にやり直す)
        void ensureRegistered(credential);
        return { credential, isLoggedIn: true, user: me.user };
      }
    } catch {
      try {
        const newTokens = await credential.client.refresh();
        const { data: me } = await credential.client.egeria.v1.me.get({
          throwOnError: true,
        });

        if (me?.user) {
          await CredentialStore.saveCredential({
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
          });

          const refreshed = {
            ...credential,
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
          };
          void ensureRegistered(refreshed);

          return { credential: refreshed, isLoggedIn: true, user: me.user };
        }
      } catch (refreshErr) {
        console.error("Token refresh failed:", refreshErr);
      }
    }
  }

  // トークンが無い or 復元失敗 → 未ログイン状態で返す。
  // ここで鍵まで消すと新しい端末で復元できなくなるので、logout() (トークンのみ) を使う
  await logout();
  return {
    credential: CredentialStore.EMPTY_CREDENTIAL,
    isLoggedIn: false,
    user: undefined,
  };
};

/**
 * OAuth PKCE フローを開始してログインする。
 */
export const login = async (): Promise<AuthResult> => {
  const credential = await CredentialStore.getCredential();

  const pcke = await PKCE.create();
  const state = v4();
  const redirect = credential.client.oauth.getAuthorizeURL(
    API_KEY.redirectUri,
    pcke,
    state,
  );
  const result = await WebBrowser.openAuthSessionAsync(
    redirect.toString(),
    API_KEY.redirectUri,
    {
      preferEphemeralSession: true,
    },
  );

  if (result.type === "success" && result.url) {
    const url = new URL(result.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    if (code && returnedState === state) {
      const token = await credential.client.oauth.getAccessTokenByCode(
        code,
        API_KEY.redirectUri,
        pcke,
      );
      await CredentialStore.saveCredential({ ...token });
      const newCredential = await CredentialStore.getCredential();

      try {
        const { data: me } = await newCredential.client.egeria.v1.me.get();

        if (me?.user) {
          const loggedIn = {
            ...newCredential,
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
          };
          // ログインでは記録の新しさに関わらず作り直す (別アカウントの鍵や、サーバーで消えた鍵が端末に残っていることがある)
          void ensureRegistered(loggedIn, { force: true });

          return { credential: loggedIn, isLoggedIn: true, user: me.user };
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  return {
    credential: CredentialStore.EMPTY_CREDENTIAL,
    isLoggedIn: false,
    user: undefined,
  };
};

/**
 * 保存済みトークンだけを消す。Restore Credentials の鍵には触らない。
 * tryRestore() の後片付けで使うため、ここで鍵を消してはいけない。
 */
export const logout = async (): Promise<void> => {
  await CredentialStore.clear();
};

/**
 * ユーザー操作によるサインアウト。Restore Credentials の鍵を消してからトークンを消す。
 * unregister は失敗しても例外を投げず、端末側の鍵は必ず消える。
 * server: false ならサーバー側の鍵の削除を行わない (アカウント削除後に使う)。
 */
export const signOut = async (
  credential: CredentialStore.Credential,
  options?: { server?: boolean },
): Promise<void> => {
  await unregister(credential, options);
  await logout();
};
