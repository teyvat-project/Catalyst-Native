import { API_KEY } from "@/constants/apikey";
import * as CredentialStore from "@/models/credential-store";
import { OAuthError } from "@natsuneko-laboratory/catalyst-sdk";
import * as Sentry from "@sentry/react-native";
import * as SecureStore from "expo-secure-store";
import { CatalystRestoreCredential } from "./restore-credential-module";

/** 復元全体のタイムアウト (ms)。起動を待たせないために短くしている */
const RESTORE_TIMEOUT_MS = 5000;
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
        // 期限切れや取り消し済みの鍵。端末から消して、次回のログイン後に作り直す
        await module.clearAsync().catch((err) => Sentry.captureException(err));
      } else {
        Sentry.captureException(e);
      }

      return null;
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RESTORE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([attempt(), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 端末上の鍵がなければ (または古ければ) 作ってサーバーに登録する。
 * バックグラウンドで呼ぶ想定で、失敗しても例外は投げない (次回の起動でもう一度試す)。
 */
export const ensureRegistered = async (credential: CredentialStore.Credential): Promise<void> => {
  const module = getModule();
  if (!module) return;

  try {
    const record = await readRecord();
    // registeredAt が不正な日付なら NaN になり、作り直す側に倒れる
    if (record && Date.now() - Date.parse(record.registeredAt) < ROTATION_INTERVAL_MS) return;

    const api = credential.client.egeria.v1.restoreCredentials;
    const { data: options } = await api.registrationOptions.create({ throwOnError: true });
    const registration = await module.createAsync(JSON.stringify(options));
    const { data } = await api.create({ body: JSON.parse(registration), throwOnError: true });

    const next: Record = { credentialId: data.credentialId, registeredAt: new Date().toISOString() };
    await SecureStore.setItemAsync(RECORD_KEY, JSON.stringify(next));

    // 古い鍵の削除は後始末。失敗しても新しい記録は残す (古い鍵はサーバー側で期限切れになる)
    if (record) {
      await api.credentialId
        .delete({ path: { credentialId: record.credentialId }, throwOnError: true })
        .catch((e) => Sentry.captureException(e));
    }
  } catch (e) {
    Sentry.captureException(e);
  }
};

/**
 * サインアウト時に、サーバーと端末の鍵を消す。
 * サーバーへの削除が失敗しても、端末側は必ず消す。
 */
export const unregister = async (credential: CredentialStore.Credential): Promise<void> => {
  const module = getModule();
  if (!module) return;

  const record = await readRecord();
  if (record) {
    await credential.client.egeria.v1.restoreCredentials.credentialId
      .delete({ path: { credentialId: record.credentialId }, throwOnError: true })
      .catch((e) => Sentry.captureException(e));
  }

  await module.clearAsync().catch((e) => Sentry.captureException(e));
  await SecureStore.deleteItemAsync(RECORD_KEY).catch((e) => Sentry.captureException(e));
};
