import { requireOptionalNativeModule } from "expo";

export type CatalystRestoreCredentialModule = {
  isAvailable(): boolean;
  /** 登録結果 (RegistrationResponseJSON) の JSON 文字列を返す */
  createAsync(requestJson: string): Promise<string>;
  /** 認証結果 (AuthenticationResponseJSON) の JSON 文字列を返す。鍵がなければ null */
  getAsync(requestJson: string): Promise<string | null>;
  clearAsync(): Promise<void>;
};

/** modules/catalyst-restore-credential の Android 実装。iOS / Web ではネイティブ側が存在しないので null になる */
export const CatalystRestoreCredential =
  requireOptionalNativeModule<CatalystRestoreCredentialModule>("CatalystRestoreCredential");
