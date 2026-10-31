import { API_KEY } from "@/constants/apikey";
import * as CredentialStore from "@/models/credential-store";
import { ApiError, OAuthError } from "@natsuneko-laboratory/catalyst-sdk";
import * as Sentry from "@sentry/react-native";
import * as SecureStore from "expo-secure-store";
import { CatalystRestoreCredential } from "./restore-credential-module";

/** 復元全体のタイムアウト (ms)。起動を待たせないために短くしている */
const RESTORE_TIMEOUT_MS = 5000;
/** サインアウト時のサーバー側の鍵の削除を待つ上限 (ms)。サインアウトを止めないために設ける */
const UNREGISTER_TIMEOUT_MS = 5000;
/** 鍵を作り直す間隔。サーバー側の有効期限より十分短くしておく */
const ROTATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
/** 端末上の鍵の記録。SecureStore はバックアップされないので、新しい端末には存在しない */
const RECORD_KEY = "restore_credential";

type Record = {
  credentialId: string;
  /** ISO 8601 */
  registeredAt: string;
};

/** iOS / Web ではネイティブモジュールがなく、Android でも API 28 未満では使えない */
const getModule = () => {
  const module = CatalystRestoreCredential;
  return module?.isAvailable() ? module : null;
};

const readRecord = async (): Promise<Record | null> => {
  try {
    const value = await SecureStore.getItemAsync(RECORD_KEY);
    if (!value) return null;

    const record = JSON.parse(value);
    if (typeof record?.credentialId === "string" && typeof record?.registeredAt === "string") {
      return record;
    }
  } catch {
    // 壊れた記録は無かったものとして扱い、登録し直す
  }

  return null;
};

/**
 * 新しい端末で、保存済みの鍵からトークンを取得する。
 * 鍵がない・失敗・タイムアウトのときは null を返す (呼び出し側は通常のログインに戻る)。
 */
export const restore = async (): Promise<{ accessToken: string; refreshToken: string } | null> => {
  const module = getModule();
  if (!module) return null;

  const attempt = async () => {
    try {
      // 復元の時点ではトークンがないので、トークンなしのクライアントを使う
      const client = CredentialStore.EMPTY_CREDENTIAL.client;
      const { data: options } = await client.egeria.v1.restoreCredentials.authenticationOptions.create({
        body: { client_id: API_KEY.clientId ?? "", client_secret: API_KEY.clientSecret ?? "" },
        throwOnError: true,
      });

      // 鍵がなければ null (NoCredentialException)。正常な結果なので Sentry には送らない
      const credential = await module.getAsync(JSON.stringify(options));
      if (credential === null) return null;

      const token = await client.oauth.getAccessTokenByRestoreCredential(credential);
      return { accessToken: token.accessToken, refreshToken: token.refreshToken };
    } catch (e) {
      if (e instanceof OAuthError && e.info?.error === "invalid_grant") {
        // 期限切れや取り消し済みの鍵。端末の鍵と記録を消して、次回のログイン後に作り直す。
        // 記録を残すと、ensureRegistered が「登録済み」と見なして作り直さなくなる
        await module.clearAsync().catch((err) => Sentry.captureException(err));
        await SecureStore.deleteItemAsync(RECORD_KEY).catch((err) => Sentry.captureException(err));
      }

      Sentry.captureException(e);

      return null;
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      Sentry.captureMessage("Restore Credentials: restore timed out");
      resolve(null);
    }, RESTORE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([attempt(), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 端末上の鍵がなければ (または古ければ) 作ってサーバーに登録する。
 * force を指定すると、記録の新しさに関わらず作り直す (ログイン直後用)。
 * 記録はユーザーと結び付いておらず、サーバー側で鍵が消えている場合もあるため、ログインでは必ず作り直す。
 * バックグラウンドで呼ぶ想定で、失敗しても例外は投げない (次回の起動でもう一度試す)。
 */
export const ensureRegistered = async (
  credential: CredentialStore.Credential,
  { force = false }: { force?: boolean } = {},
): Promise<void> => {
  const module = getModule();
  if (!module) return;

  try {
    const record = await readRecord();
    // registeredAt が不正な日付なら NaN、未来の日付なら age が負になり、どちらも作り直す側に倒れる
    const age = record ? Date.now() - Date.parse(record.registeredAt) : NaN;
    if (!force && age >= 0 && age < ROTATION_INTERVAL_MS) return;

    const api = credential.client.egeria.v1.restoreCredentials;
    const { data: options } = await api.registrationOptions.create({ throwOnError: true });
    const registration = await module.createAsync(JSON.stringify(options));
    const { data } = await api.create({ body: JSON.parse(registration), throwOnError: true });

    const next: Record = { credentialId: data.credentialId, registeredAt: new Date().toISOString() };
    await SecureStore.setItemAsync(RECORD_KEY, JSON.stringify(next));

    // 古い鍵の削除は後始末。失敗しても新しい記録は残す (古い鍵はサーバー側で期限切れになる)。
    // 404 は鍵がすでにない (別ユーザーの鍵、または取り消し済み) 場合で、想定内なので Sentry に送らない
    if (record) {
      await api.credentialId
        .delete({ path: { credentialId: record.credentialId }, throwOnError: true })
        .catch((e) => {
          if (!(e instanceof ApiError && e.status === 404)) Sentry.captureException(e);
        });
    }
  } catch (e) {
    Sentry.captureException(e);
  }
};

/**
 * サインアウト時に、端末とサーバーの鍵を消す。
 * 端末側を先に消し、サーバーへの削除はベストエフォート (最大 UNREGISTER_TIMEOUT_MS) にする。
 * サーバーが応答しなくても、サインアウトは止まらない。
 * server: false なら端末側だけ消す (アカウント削除時は、サーバーが鍵ごと消しているため)。
 */
export const unregister = async (
  credential: CredentialStore.Credential,
  { server = true }: { server?: boolean } = {},
): Promise<void> => {
  const module = getModule();
  if (!module) return;

  const record = await readRecord();

  await module.clearAsync().catch((e) => Sentry.captureException(e));
  await SecureStore.deleteItemAsync(RECORD_KEY).catch((e) => Sentry.captureException(e));

  if (!server || !record) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UNREGISTER_TIMEOUT_MS);
  try {
    await credential.client.egeria.v1.restoreCredentials.credentialId.delete({
      path: { credentialId: record.credentialId },
      signal: controller.signal,
      throwOnError: true,
    });
  } catch (e) {
    Sentry.captureException(e);
  } finally {
    clearTimeout(timer);
  }
};
