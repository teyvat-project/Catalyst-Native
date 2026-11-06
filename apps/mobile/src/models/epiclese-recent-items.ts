import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";

// ピン編集のアイテム検索で選んだアイテムの履歴。検索欄が空のとき一覧の先頭に出す。
// アイテムはアカウントをまたいで共通なので、端末ごとに 1 つだけ持つ
const STORAGE_KEY = "epiclese_recent_items_v1";
export const MAX_RECENT_ITEMS = 20;

/** 新しく選んだアイテムを先頭に入れる。同じアイテムは前のものを消して入れ直す */
export const pushRecentItem = (items: readonly EpicleseItemResponse[], item: EpicleseItemResponse) =>
  [item, ...items.filter((recent) => recent.id !== item.id)].slice(0, MAX_RECENT_ITEMS);

export async function loadRecentItems(): Promise<EpicleseItemResponse[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as EpicleseItemResponse[]) : [];
  } catch {
    return [];
  }
}

export async function recordRecentItem(item: EpicleseItemResponse): Promise<void> {
  const items = await loadRecentItems();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pushRecentItem(items, item)));
}
