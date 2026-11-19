import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  forgetRecentAuthor,
  loadRecentAuthors,
  MAX_RECENT_AUTHORS,
  pushRecentAuthors,
  recordRecentAuthors,
  type RecentAuthor,
} from "./epiclese-recent-authors";
import { MAX_RECENT_ITEMS, loadRecentItems, recordRecentItems } from "./epiclese-recent-items";

jest.mock("@react-native-async-storage/async-storage");

const author = (id: string): RecentAuthor => ({ id, name: `author ${id}`, platformIdentifier: `usr_${id}` });

beforeEach(() => {
  resetAsyncStorageMock();
});

describe("pushRecentAuthors", () => {
  it("表示と絞り込みに要らない値は持たない", () => {
    expect(pushRecentAuthors([], [{ ...author("a"), platform: null } as RecentAuthor])).toEqual([author("a")]);
  });

  it("同じ作者は前のものを消して先頭に入れ直す", () => {
    expect(pushRecentAuthors([author("a"), author("b")], [author("b")]).map(({ id }) => id)).toEqual(["b", "a"]);
  });
});

describe("recent authors storage", () => {
  it("アイテムの履歴とは別に持つので、同じ作者のアイテムでアイテムの履歴が埋まっても作者は残る", async () => {
    await recordRecentItems([{ id: "old", type: "cloth", name: "Old", author: author("x") }]);
    for (let i = 0; i < MAX_RECENT_ITEMS; i++) {
      await recordRecentItems([{ id: `i-${i}`, type: "cloth", name: `Item ${i}`, author: author("a") }]);
    }

    expect((await loadRecentItems()).some((item) => item.id === "old")).toBe(false);
    await expect(loadRecentAuthors()).resolves.toEqual([author("a"), author("x")]);
  });

  it("上限を超えたら古い作者から捨てる", async () => {
    await recordRecentAuthors(Array.from({ length: MAX_RECENT_AUTHORS + 1 }, (_, i) => author(String(i))));

    const authors = await loadRecentAuthors();
    expect(authors).toHaveLength(MAX_RECENT_AUTHORS);
    expect(authors.at(-1)?.id).toBe(String(MAX_RECENT_AUTHORS - 1));
  });

  it("保存してある値が壊れていても、id のある履歴は読み書きできる", async () => {
    await AsyncStorage.setItem("epiclese_recent_authors_v1", JSON.stringify([null, { name: "no id" }, author("a")]));

    await expect(loadRecentAuthors()).resolves.toEqual([author("a")]);
    await recordRecentAuthors([author("b")]);
    await expect(loadRecentAuthors()).resolves.toEqual([author("b"), author("a")]);
  });

  it("外した作者は読み出さない", async () => {
    await recordRecentAuthors([author("a"), author("b")]);
    await forgetRecentAuthor("a");

    await expect(loadRecentAuthors()).resolves.toEqual([author("b")]);
  });
});
