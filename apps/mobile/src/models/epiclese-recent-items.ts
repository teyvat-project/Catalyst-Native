import type { EpicleseItemResponse, EpicleseStatusMetadataResponse } from "@natsuneko-laboratory/catalyst-sdk";

import type { EditableMediaMetadata } from "./epiclese-metadata-editor";
import { recordRecentAuthors, type RecentAuthor } from "./epiclese-recent-authors";
import { createRecentPicks } from "./recent-picks";

// ピン編集のアイテム検索で選んだアイテムの履歴。検索欄が空のとき一覧の先頭に出す。
// アイテムはアカウントをまたいで共通なので、端末ごとに 1 つだけ持つ
export const MAX_RECENT_ITEMS = 20;

// 一覧の表示と作者での絞り込みに要るものだけを持つ。選ぶときはサーバーから取り直す
export type RecentItem = Pick<EpicleseItemResponse, "id" | "type" | "name"> & {
  author: Pick<EpicleseItemResponse["author"], "id" | "name">;
};

const recentItems = createRecentPicks<RecentItem>({
  storageKey: "epiclese_recent_items_v1",
  max: MAX_RECENT_ITEMS,
  pick: ({ id, type, name, author }) => ({ id, type, name, author: { id: author.id, name: author.name } }),
});

/** 新しく使ったアイテムを先頭に入れる。同じアイテムは前のものを消して入れ直す */
export const pushRecentItems = recentItems.push;

/** 新しいアイテムは保存して初めて id が付くので、保存の結果から送ったときに id が無かったものを、ピンを置いた順に拾う */
export const pickCreatedItems = (sent: EditableMediaMetadata[], saved: EpicleseStatusMetadataResponse) => {
  const sentIds = new Set(sent.flatMap((media) => media.reference.flatMap((pin) => pin.reference ?? [])));
  return sent
    .flatMap((media) => saved[media.id]?.reference ?? [])
    .filter((pin) => !sentIds.has(pin.reference))
    .map((pin) => ({ id: pin.reference, type: pin.type, name: pin.name, author: pin.author }));
};

export const loadRecentItems = recentItems.load;

/** 選んだ (作った) アイテムを記録し、その作者も最近使った作者に入れる */
export const recordRecentItems = async (items: readonly (RecentItem & { author: RecentAuthor })[]) => {
  if (items.length === 0) return;
  await Promise.all([recentItems.record(items), recordRecentAuthors(items.map((item) => item.author))]);
};

// 保存の結果の形が想定と違っても保存の成功は変えないよう、拾うところで投げても例外にはせず、失敗として返す (async)。
// 拾うのはその場で行い、続けて呼んだ読み書きより先に列に入るようにする
export const recordCreatedItems = async (sent: EditableMediaMetadata[], saved: EpicleseStatusMetadataResponse) =>
  recordRecentItems(pickCreatedItems(sent, saved));

export const forgetRecentItem = recentItems.forget;
