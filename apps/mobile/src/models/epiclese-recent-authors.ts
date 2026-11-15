import type { EpicleseAuthorResponse } from "@natsuneko-laboratory/catalyst-sdk";

import { createRecentPicks } from "./recent-picks";

// アイテムを選んだときの、そのアイテムの作者の履歴。アイテムの作者で絞り込むとき、検索欄が空なら先頭に出す。
// アイテムの履歴とは別に上限を持つので、同じ作者のアイテムが続いてほかのアイテムが履歴から押し出されても、作者は残る。
// 記録はアイテムを記録するときに一緒に行う (epiclese-recent-items)。絞り込みで選んだだけでは記録しない
// (名前の似た作者を選んでしまったとき、違う作者が残らないように)
export const MAX_RECENT_AUTHORS = 20;

// 一覧の表示に要るものだけを持つ。選ぶときはサーバーから取り直す
export type RecentAuthor = Pick<EpicleseAuthorResponse, "id" | "name" | "platformIdentifier">;

const recentAuthors = createRecentPicks<RecentAuthor>({
  storageKey: "epiclese_recent_authors_v1",
  max: MAX_RECENT_AUTHORS,
  pick: ({ id, name, platformIdentifier }) => ({ id, name, platformIdentifier }),
});

export const pushRecentAuthors = recentAuthors.push;

export const loadRecentAuthors = recentAuthors.load;

export const recordRecentAuthors = recentAuthors.record;

export const forgetRecentAuthor = recentAuthors.forget;
