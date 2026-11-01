import type { EpiclesePlatformResponse } from "@natsuneko-laboratory/catalyst-sdk";

// サーバーの extract*PlatformIdentifier が受け付ける書式の例。プラットフォーム名の小文字で引く
const WORLD_ID_PLACEHOLDERS: Record<string, string> = {
  vrchat: "wrld_a5e9ec13-36b1-4e63-ae0c-dab9023401f9",
  cluster: "https://cluster.mu/w/20d14291-1d6b-4ad9-9f4e-fe8b87dd6f0c",
  resonite: "https://go.resonite.com/world/U-esnya/R-3acf68b3-b78b-4a8c-96ef-97a2f744602f",
  xrift: "https://app.xrift.net/world/cdd3397c-7749-45a1-bdb4-c958cc9f1237",
};

const AUTHOR_ID_PLACEHOLDERS: Record<string, string> = {
  vrchat: "usr_f0ae733a-b3ea-4462-b9a7-8c386e860ac1",
  cluster: "https://cluster.mu/u/ichiganryuta",
  resonite: "U-esnya",
  xrift: "https://app.xrift.net/user/abe6ebca-b060-4d09-82c1-224e3a0ea77c",
};

// VR-SNS のアカウントを持たない作者 (BOOTH のショップだけの作者など) の例
const NO_PLATFORM_AUTHOR_ID_PLACEHOLDER = "https://your-shop.booth.pm/";

export const getWorldIdPlaceholder = (platform: EpiclesePlatformResponse | undefined) =>
  (platform && WORLD_ID_PLACEHOLDERS[platform.name.toLowerCase()]) ?? WORLD_ID_PLACEHOLDERS.vrchat;

export const getAuthorIdPlaceholder = (platform: EpiclesePlatformResponse | undefined) =>
  platform
    ? (AUTHOR_ID_PLACEHOLDERS[platform.name.toLowerCase()] ?? AUTHOR_ID_PLACEHOLDERS.vrchat)
    : NO_PLATFORM_AUTHOR_ID_PLACEHOLDER;
