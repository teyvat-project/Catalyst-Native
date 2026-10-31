import { OAuthError } from "@natsuneko-laboratory/catalyst-sdk";
import * as Sentry from "@sentry/react-native";
import * as SecureStore from "expo-secure-store";
import * as CredentialStore from "./credential-store";
import { ensureRegistered, restore, unregister } from "./restore-credential";

let mockModule: unknown;

// automock だと OAuthError がコンストラクタとして使えず info も設定されないので、同じ形の最小実装に差し替える
jest.mock("@natsuneko-laboratory/catalyst-sdk", () => ({
  OAuthError: class OAuthError extends Error {
    info?: { error: string };
    constructor(message: string, _kind: string, info?: { error: string }) {
      super(message);
      this.info = info;
    }
  },
}));
jest.mock("@/constants/apikey", () => ({
  API_KEY: { clientId: "client-id", clientSecret: "client-secret", redirectUri: "" },
}));
jest.mock("./restore-credential-module", () => ({
  get CatalystRestoreCredential() {
    return mockModule;
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
}));
jest.mock("./credential-store", () => ({
  EMPTY_CREDENTIAL: {
    accessToken: "",
    refreshToken: "",
    client: {
      oauth: { getAccessTokenByRestoreCredential: jest.fn() },
      egeria: {
        v1: {
          restoreCredentials: {
            authenticationOptions: { create: jest.fn() },
          },
        },
      },
    },
  },
}));

const RECORD_KEY = "restore_credential";
const DAY = 24 * 60 * 60 * 1000;

const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;
const mockedDeleteItem = SecureStore.deleteItemAsync as jest.Mock;
const mockedCaptureException = Sentry.captureException as jest.Mock;

const emptyClient = CredentialStore.EMPTY_CREDENTIAL.client as any;
const mockedAuthenticationOptions = emptyClient.egeria.v1.restoreCredentials.authenticationOptions.create as jest.Mock;
const mockedGrant = emptyClient.oauth.getAccessTokenByRestoreCredential as jest.Mock;

const createNativeModule = () => ({
  isAvailable: jest.fn().mockReturnValue(true),
  createAsync: jest.fn(),
  getAsync: jest.fn(),
  clearAsync: jest.fn().mockResolvedValue(undefined),
});

const createFakeClient = () => ({
  egeria: {
    v1: {
      restoreCredentials: {
        registrationOptions: { create: jest.fn() },
        create: jest.fn(),
        credentialId: { delete: jest.fn() },
      },
    },
  },
});

const createCredential = (client = createFakeClient()) =>
  ({ accessToken: "a", refreshToken: "r", client }) as unknown as CredentialStore.Credential & {
    client: ReturnType<typeof createFakeClient>;
  };

const oauthError = (code: string) => new OAuthError(code, "invalidTokenResponse", { error: code });

const recordOf = (credentialId: string, registeredAt: Date) =>
  JSON.stringify({ credentialId, registeredAt: registeredAt.toISOString() });

let native: ReturnType<typeof createNativeModule>;

beforeEach(() => {
  jest.clearAllMocks();
  native = createNativeModule();
  mockModule = native;
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("restore", () => {
  it("認証オプション → getAsync → grant の順に呼び、トークンを返す", async () => {
    const order: string[] = [];
    const options = { challenge: "c", rpId: "catalyst.natsuneko.com" };
    mockedAuthenticationOptions.mockImplementation(async () => {
      order.push("options");
      return { data: options };
    });
    native.getAsync.mockImplementation(async () => {
      order.push("get");
      return '{"id":"cred"}';
    });
    mockedGrant.mockImplementation(async () => {
      order.push("grant");
      return { accessToken: "new-a", refreshToken: "new-r", tokenType: "Bearer" };
    });

    const result = await restore();

    expect(order).toEqual(["options", "get", "grant"]);
    expect(mockedAuthenticationOptions).toHaveBeenCalledWith({
      body: { client_id: "client-id", client_secret: "client-secret" },
      throwOnError: true,
    });
    expect(native.getAsync).toHaveBeenCalledWith(JSON.stringify(options));
    expect(mockedGrant).toHaveBeenCalledWith('{"id":"cred"}');
    expect(result).toEqual({ accessToken: "new-a", refreshToken: "new-r" });
  });

  it("鍵がなければ (getAsync が null) null を返し、Sentry に送らない", async () => {
    mockedAuthenticationOptions.mockResolvedValue({ data: { challenge: "c" } });
    native.getAsync.mockResolvedValue(null);

    const result = await restore();

    expect(result).toBeNull();
    expect(mockedGrant).not.toHaveBeenCalled();
    expect(native.clearAsync).not.toHaveBeenCalled();
    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it("invalid_grant なら clearAsync を呼んで Sentry に送り、null を返す", async () => {
    mockedAuthenticationOptions.mockResolvedValue({ data: { challenge: "c" } });
    native.getAsync.mockResolvedValue("{}");
    const error = oauthError("invalid_grant");
    mockedGrant.mockRejectedValue(error);

    const result = await restore();

    expect(result).toBeNull();
    expect(native.clearAsync).toHaveBeenCalledTimes(1);
    expect(mockedCaptureException).toHaveBeenCalledWith(error);
  });

  it("その他の失敗は Sentry に送って null を返す", async () => {
    const error = new Error("network");
    mockedAuthenticationOptions.mockRejectedValue(error);

    const result = await restore();

    expect(result).toBeNull();
    expect(mockedCaptureException).toHaveBeenCalledWith(error);
    expect(native.clearAsync).not.toHaveBeenCalled();
  });

  it("invalid_grant 以外の OAuthError は鍵を消さずに Sentry に送る", async () => {
    mockedAuthenticationOptions.mockResolvedValue({ data: { challenge: "c" } });
    native.getAsync.mockResolvedValue("{}");
    const error = oauthError("server_error");
    mockedGrant.mockRejectedValue(error);

    const result = await restore();

    expect(result).toBeNull();
    expect(native.clearAsync).not.toHaveBeenCalled();
    expect(mockedCaptureException).toHaveBeenCalledWith(error);
  });

  it("5000 ms 以内に終わらなければ null を返す", async () => {
    jest.useFakeTimers();
    mockedAuthenticationOptions.mockReturnValue(new Promise(() => {}));

    let result: unknown = "pending";
    const promise = restore().then((r) => {
      result = r;
    });

    await jest.advanceTimersByTimeAsync(4999);
    expect(result).toBe("pending");

    await jest.advanceTimersByTimeAsync(1);
    await promise;
    expect(result).toBeNull();
  });

  it("ネイティブモジュールが null なら何も呼ばず null", async () => {
    mockModule = null;

    const result = await restore();

    expect(result).toBeNull();
    expect(mockedAuthenticationOptions).not.toHaveBeenCalled();
  });

  it("isAvailable が false なら何も呼ばず null", async () => {
    native.isAvailable.mockReturnValue(false);

    const result = await restore();

    expect(result).toBeNull();
    expect(mockedAuthenticationOptions).not.toHaveBeenCalled();
    expect(native.getAsync).not.toHaveBeenCalled();
  });
});

describe("ensureRegistered", () => {
  const stubRegistration = (credential: ReturnType<typeof createCredential>, newId = "new-id") => {
    const api = credential.client.egeria.v1.restoreCredentials;
    api.registrationOptions.create.mockResolvedValue({ data: { challenge: "c" } });
    native.createAsync.mockResolvedValue('{"id":"created"}');
    api.create.mockResolvedValue({ data: { credentialId: newId } });
    api.credentialId.delete.mockResolvedValue({ data: null });
    return api;
  };

  it("記録がなければ登録し、記録を保存する", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
    const credential = createCredential();
    const api = stubRegistration(credential);

    await ensureRegistered(credential);

    expect(api.registrationOptions.create).toHaveBeenCalledWith({ throwOnError: true });
    expect(native.createAsync).toHaveBeenCalledWith(JSON.stringify({ challenge: "c" }));
    expect(api.create).toHaveBeenCalledWith({ body: { id: "created" }, throwOnError: true });
    expect(mockedSetItem).toHaveBeenCalledWith(
      RECORD_KEY,
      JSON.stringify({ credentialId: "new-id", registeredAt: "2026-11-01T00:00:00.000Z" }),
    );
    expect(api.credentialId.delete).not.toHaveBeenCalled();
  });

  it("記録が 30 日以上前なら作り直し、古い credentialId を DELETE する", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);
    mockedGetItem.mockResolvedValue(recordOf("old-id", new Date(now.getTime() - 30 * DAY)));
    const credential = createCredential();
    const api = stubRegistration(credential);

    await ensureRegistered(credential);

    expect(mockedSetItem).toHaveBeenCalledWith(
      RECORD_KEY,
      JSON.stringify({ credentialId: "new-id", registeredAt: now.toISOString() }),
    );
    expect(api.credentialId.delete).toHaveBeenCalledWith({ path: { credentialId: "old-id" }, throwOnError: true });
    // 新しい記録を保存してから古い鍵を消す
    expect(mockedSetItem.mock.invocationCallOrder[0]).toBeLessThan(
      api.credentialId.delete.mock.invocationCallOrder[0],
    );
  });

  it("古い鍵の DELETE に失敗しても新しい記録は残る", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);
    mockedGetItem.mockResolvedValue(recordOf("old-id", new Date(now.getTime() - 31 * DAY)));
    const credential = createCredential();
    const api = stubRegistration(credential);
    api.credentialId.delete.mockRejectedValue(new Error("404"));

    await expect(ensureRegistered(credential)).resolves.toBeUndefined();

    expect(mockedSetItem).toHaveBeenCalledTimes(1);
    expect(mockedDeleteItem).not.toHaveBeenCalled();
  });

  it("記録が 30 日未満なら何もしない", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);
    mockedGetItem.mockResolvedValue(recordOf("old-id", new Date(now.getTime() - 29 * DAY)));
    const credential = createCredential();
    const api = stubRegistration(credential);

    await ensureRegistered(credential);

    expect(api.registrationOptions.create).not.toHaveBeenCalled();
    expect(native.createAsync).not.toHaveBeenCalled();
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it("記録が壊れていれば登録し直す", async () => {
    mockedGetItem.mockResolvedValue("not json");
    const credential = createCredential();
    const api = stubRegistration(credential);

    await ensureRegistered(credential);

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(mockedSetItem).toHaveBeenCalledTimes(1);
  });

  it("失敗しても例外を投げない", async () => {
    const error = new Error("boom");
    const credential = createCredential();
    credential.client.egeria.v1.restoreCredentials.registrationOptions.create.mockRejectedValue(error);

    await expect(ensureRegistered(credential)).resolves.toBeUndefined();

    expect(mockedSetItem).not.toHaveBeenCalled();
    expect(mockedCaptureException).toHaveBeenCalledWith(error);
  });

  it("ネイティブモジュールが null ならサーバーを呼ばない", async () => {
    mockModule = null;
    const credential = createCredential();

    await ensureRegistered(credential);

    expect(credential.client.egeria.v1.restoreCredentials.registrationOptions.create).not.toHaveBeenCalled();
    expect(mockedGetItem).not.toHaveBeenCalled();
  });
});

describe("unregister", () => {
  it("端末の鍵と記録を消してから、サーバーの DELETE を行う", async () => {
    mockedGetItem.mockResolvedValue(recordOf("cred-1", new Date()));
    const credential = createCredential();
    const api = credential.client.egeria.v1.restoreCredentials;
    api.credentialId.delete.mockResolvedValue({ data: null });

    await unregister(credential);

    expect(api.credentialId.delete).toHaveBeenCalledWith({
      path: { credentialId: "cred-1" },
      signal: expect.any(AbortSignal),
      throwOnError: true,
    });
    expect(native.clearAsync).toHaveBeenCalledTimes(1);
    expect(mockedDeleteItem).toHaveBeenCalledWith(RECORD_KEY);
    const serverOrder = api.credentialId.delete.mock.invocationCallOrder[0];
    expect(native.clearAsync.mock.invocationCallOrder[0]).toBeLessThan(serverOrder);
    expect(mockedDeleteItem.mock.invocationCallOrder[0]).toBeLessThan(serverOrder);
  });

  it("サーバーが応答しなくても 5000 ms で打ち切り、端末側は消えている", async () => {
    jest.useFakeTimers();
    mockedGetItem.mockResolvedValue(recordOf("cred-1", new Date()));
    const credential = createCredential();
    // 応答しない通信。実際の SDK と同じく signal の abort で reject される
    credential.client.egeria.v1.restoreCredentials.credentialId.delete.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );

    let done = false;
    const promise = unregister(credential).then(() => {
      done = true;
    });

    await jest.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    expect(native.clearAsync).toHaveBeenCalledTimes(1);
    expect(mockedDeleteItem).toHaveBeenCalledWith(RECORD_KEY);

    await jest.advanceTimersByTimeAsync(1);
    await promise;
    expect(done).toBe(true);
    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
  });

  it("サーバーの DELETE が失敗しても clearAsync と記録の削除は行う", async () => {
    mockedGetItem.mockResolvedValue(recordOf("cred-1", new Date()));
    const credential = createCredential();
    const error = new Error("offline");
    credential.client.egeria.v1.restoreCredentials.credentialId.delete.mockRejectedValue(error);

    await expect(unregister(credential)).resolves.toBeUndefined();

    expect(native.clearAsync).toHaveBeenCalledTimes(1);
    expect(mockedDeleteItem).toHaveBeenCalledWith(RECORD_KEY);
    expect(mockedCaptureException).toHaveBeenCalledWith(error);
  });

  it("記録がなければ clearAsync だけ行う", async () => {
    const credential = createCredential();

    await unregister(credential);

    expect(credential.client.egeria.v1.restoreCredentials.credentialId.delete).not.toHaveBeenCalled();
    expect(native.clearAsync).toHaveBeenCalledTimes(1);
  });

  it("clearAsync が失敗しても記録は削除し、例外を投げない", async () => {
    mockedGetItem.mockResolvedValue(recordOf("cred-1", new Date()));
    const credential = createCredential();
    credential.client.egeria.v1.restoreCredentials.credentialId.delete.mockResolvedValue({ data: null });
    native.clearAsync.mockRejectedValue(new Error("play services"));

    await expect(unregister(credential)).resolves.toBeUndefined();

    expect(mockedDeleteItem).toHaveBeenCalledWith(RECORD_KEY);
  });

  it("ネイティブモジュールが null なら何もしない", async () => {
    mockModule = null;
    mockedGetItem.mockResolvedValue(recordOf("cred-1", new Date()));
    const credential = createCredential();

    await unregister(credential);

    expect(credential.client.egeria.v1.restoreCredentials.credentialId.delete).not.toHaveBeenCalled();
    expect(mockedDeleteItem).not.toHaveBeenCalled();
  });
});
