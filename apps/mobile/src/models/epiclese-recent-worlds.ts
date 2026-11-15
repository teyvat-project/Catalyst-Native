import type { EpicleseWorldResponse } from "@natsuneko-laboratory/catalyst-sdk";

import { createRecentPicks, type RecentPicks } from "./recent-picks";

// タグ付けのワールド検索で選んだワールドの履歴。検索欄が空のとき一覧の先頭に出す。
// ワールドの検索はプラットフォームごとなので、履歴もプラットフォームごとに分けて持つ。アカウントはまたいで共通
const MAX_RECENT_WORLDS = 20;

// 一覧の表示に要るものだけを持つ。選ぶときはサーバーから取り直す
export type RecentWorld = Pick<EpicleseWorldResponse, "id" | "name"> & {
  author: Pick<NonNullable<EpicleseWorldResponse["author"]>, "id" | "name"> | null;
};

// 書き込みの順番待ちは履歴ごとに持つので、プラットフォームごとの履歴は 1 度作ったら使い回す
const stores = new Map<string, RecentPicks<RecentWorld>>();
const create = (platformId: string) =>
  createRecentPicks<RecentWorld>({
    storageKey: `epiclese_recent_worlds_v1:${platformId}`,
    max: MAX_RECENT_WORLDS,
    pick: ({ id, name, author }) => ({ id, name, author: author ? { id: author.id, name: author.name } : null }),
  });
const storeOf = (platformId: string) =>
  stores.get(platformId) ?? stores.set(platformId, create(platformId)).get(platformId)!;

export const loadRecentWorlds = (platformId: string) => storeOf(platformId).load();

export const recordRecentWorld = (platformId: string, world: RecentWorld) => storeOf(platformId).record([world]);

export const forgetRecentWorld = (platformId: string, id: string) => storeOf(platformId).forget(id);
