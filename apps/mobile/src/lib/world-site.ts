// 公式サイトのページ・サムネイル・作成者を引けるワールドを、プラットフォームごとに振り分ける。
// Web 版の WorldCard / worldExternalUrl と同じく、今のところ VRChat と XRift だけに対応する。

import { fetchVRChatWorldAuthorName, isVRChatWorldId, vrchatWorldThumbnailUrl } from "@/lib/vrchat-world";
import { fetchXRiftWorldAuthorName, isXRiftWorld, xriftWorldThumbnailUrl } from "@/lib/xrift-world";

export type WorldSite = {
  /** カードや読み上げに出すプラットフォーム名 */
  platformName: string;
  /** 公式サイトのワールドページ */
  url: string;
  thumbnailUrl: string;
  fetchAuthorName: (signal?: AbortSignal) => Promise<string | null>;
};

/** 対応していないプラットフォーム・ID の形でなければ null */
export const getWorldSite = (platformName: string | null | undefined, platformIdentifier: string): WorldSite | null => {
  const id = encodeURIComponent(platformIdentifier);

  if (isVRChatWorldId(platformIdentifier)) {
    return {
      platformName: "VRChat",
      url: `https://vrchat.com/home/world/${id}`,
      thumbnailUrl: vrchatWorldThumbnailUrl(platformIdentifier),
      fetchAuthorName: (signal) => fetchVRChatWorldAuthorName(platformIdentifier, signal),
    };
  }
  if (isXRiftWorld(platformName, platformIdentifier)) {
    return {
      platformName: "XRift",
      url: `https://app.xrift.net/world/${id}`,
      thumbnailUrl: xriftWorldThumbnailUrl(platformIdentifier),
      fetchAuthorName: (signal) => fetchXRiftWorldAuthorName(platformIdentifier, signal),
    };
  }

  return null;
};
