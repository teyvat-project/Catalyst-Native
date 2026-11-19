import type { UserProfile } from "./epiclese-metadata-editor";
import { createRecentPicks } from "./recent-picks";

// 写っている人のピッカーで選んだユーザーの履歴。検索欄が空のとき一覧に出す。
// アイテムと同じく、アカウントをまたいで端末ごとに 1 つだけ持つ
const MAX_RECENT_USERS = 20;

// 一覧とチップの表示に要るものだけを持つ。選ぶときはサーバーから取り直す
export type RecentUser = { id: string } & UserProfile;

const recentUsers = createRecentPicks<RecentUser>({
  storageKey: "epiclese_recent_users_v1",
  max: MAX_RECENT_USERS,
  pick: ({ id, displayName, screenName, iconUrl }) => ({ id, displayName, screenName, iconUrl }),
});

export const loadRecentUsers = recentUsers.load;

export const recordRecentUsers = recentUsers.record;

export const forgetRecentUser = recentUsers.forget;
