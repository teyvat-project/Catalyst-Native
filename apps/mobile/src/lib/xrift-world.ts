// XRift のワールド情報 (作成者・サムネイル) を、XRift Public API を中継する miliastra (`/xrift/v1/worlds/:id`) から取得する。
//
// VRChat (vrchat-world.ts) と同じく、作成者やサムネイルはサーバーの Epiclese メタデータに入っていないので、Web 版と同じくここから取る。
// XRift への問い合わせ結果は miliastra 側でキャッシュされるので、アプリ側では覚えておかない。

const MILIASTRA_XRIFT_WORLDS = "https://miliastra.natsuneko.com/xrift/v1/worlds";

// miliastra が受け付けるのは小文字の UUID だけ。Epiclese には小文字にそろえて保存されている
const XRIFT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * XRift のワールドか。XRift のワールド ID はただの UUID で cluster と見分けられないため、プラットフォーム名で判定する
 */
export const isXRiftWorld = (platformName: string | null | undefined, id: string) =>
  platformName?.toLowerCase() === "xrift" && XRIFT_ID_PATTERN.test(id);

const worldUrl = (worldId: string) => `${MILIASTRA_XRIFT_WORLDS}/${encodeURIComponent(worldId)}`;

/** ワールドの作成者名を返す。非公開・削除済み・作成者不明・通信失敗・中断のときは null */
export const fetchXRiftWorldAuthorName = (worldId: string, signal?: AbortSignal): Promise<string | null> =>
  fetch(worldUrl(worldId), { signal })
    .then(async (res) =>
      res.ok ? ((await res.json()) as { owner?: { displayName?: unknown } | null }).owner?.displayName : null,
    )
    .then((displayName) => (typeof displayName === "string" && displayName ? displayName : null))
    .catch(() => null);

/** Web 版のワールドカードと同じ、カード向けのサムネイル画像の URL */
export const xriftWorldThumbnailUrl = (worldId: string) => `${worldUrl(worldId)}/thumbnail?variant=card`;
