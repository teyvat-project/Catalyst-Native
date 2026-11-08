import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EpicleseItemResponse, EpicleseStatusMetadataResponse } from "@natsuneko-laboratory/catalyst-sdk";

import type { EditableMediaMetadata } from "./epiclese-metadata-editor";

// ピン編集のアイテム検索で選んだアイテムの履歴。検索欄が空のとき一覧の先頭に出す。
// アイテムはアカウントをまたいで共通なので、端末ごとに 1 つだけ持つ
const STORAGE_KEY = "epiclese_recent_items_v1";
export const MAX_RECENT_ITEMS = 20;

// 一覧の表示と作者での絞り込みに要るものだけを持つ。選ぶときはサーバーから取り直す
export type RecentItem = Pick<EpicleseItemResponse, "id" | "type" | "name"> & {
  author: Pick<EpicleseItemResponse["author"], "id" | "name">;
};

const toRecentItem = ({ id, type, name, author }: RecentItem): RecentItem => ({
  id,
  type,
  name,
  author: { id: author.id, name: author.name },
});

/** 新しく使ったアイテムを先頭に入れる。同じアイテムは前のものを消して入れ直す */
export const pushRecentItems = (items: readonly RecentItem[], added: readonly RecentItem[]) => {
  const unique = [...new Map(added.map((item) => [item.id, toRecentItem(item)])).values()];
  const ids = new Set(unique.map((item) => item.id));
  return [...unique, ...items.filter((item) => !ids.has(item.id))].slice(0, MAX_RECENT_ITEMS);
};

/** 新しいアイテムは保存して初めて id が付くので、保存の結果から送ったときに id が無かったものを、ピンを置いた順に拾う */
export const pickCreatedItems = (
  sent: EditableMediaMetadata[],
  saved: EpicleseStatusMetadataResponse,
): RecentItem[] => {
  const sentIds = new Set(sent.flatMap((media) => media.reference.flatMap((pin) => pin.reference ?? [])));
  return sent
    .flatMap((media) => saved[media.id]?.reference ?? [])
    .filter((pin) => !sentIds.has(pin.reference))
    .map((pin) => ({ id: pin.reference, type: pin.type, name: pin.name, author: pin.author }));
};

const readItems = async (): Promise<RecentItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
  } catch {
    return [];
  }
};

const update = async (updater: (items: RecentItem[]) => RecentItem[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updater(await readItems())));
};

// 読んで書き換える処理が重なると、先に書いた分が消える。読み出しも順番に並べ、選んだ直後に開き直しても入っているようにする
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>) => {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
};

export const loadRecentItems = () => enqueue(readItems);

export const recordRecentItems = (items: readonly RecentItem[]) =>
  enqueue(() => update((recent) => pushRecentItems(recent, items)));

// 保存の結果の形が想定と違っても保存の成功は変えないよう、拾うところから列の中で行い、失敗は呼び出し側で捨てられるようにする
export const recordCreatedItems = (sent: EditableMediaMetadata[], saved: EpicleseStatusMetadataResponse) =>
  enqueue(() => update((recent) => pushRecentItems(recent, pickCreatedItems(sent, saved))));

export const forgetRecentItem = (id: string) =>
  enqueue(() => update((recent) => recent.filter((item) => item.id !== id)));
