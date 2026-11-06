import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { loadRecentItems, MAX_RECENT_ITEMS, pushRecentItem, recordRecentItem } from "./epiclese-recent-items";

jest.mock("@react-native-async-storage/async-storage");

const item = (id: string): EpicleseItemResponse => ({
  id,
  type: "cloth",
  name: `item ${id}`,
  description: "",
  externalUrl: null,
  imageUrl: null,
  author: { id: "author-1", platformIdentifier: "shop", platform: null, name: "Shop" },
});

beforeEach(() => {
  resetAsyncStorageMock();
});

describe("pushRecentItem", () => {
  it("新しく選んだアイテムを先頭に入れる", () => {
    expect(pushRecentItem([item("a"), item("b")], item("c")).map(({ id }) => id)).toEqual(["c", "a", "b"]);
  });

  it("同じアイテムは前のものを消して先頭に入れ直す", () => {
    const renamed = { ...item("b"), name: "renamed" };
    expect(pushRecentItem([item("a"), item("b")], renamed)).toEqual([renamed, item("a")]);
  });

  it("上限を超えたら古いものから捨てる", () => {
    const full = Array.from({ length: MAX_RECENT_ITEMS }, (_, i) => item(String(i)));
    const next = pushRecentItem(full, item("new"));

    expect(next).toHaveLength(MAX_RECENT_ITEMS);
    expect(next[0].id).toBe("new");
    expect(next.at(-1)?.id).toBe(String(MAX_RECENT_ITEMS - 2));
  });
});

describe("recent items storage", () => {
  it("記録したアイテムを新しい順に読み出す", async () => {
    await recordRecentItem(item("a"));
    await recordRecentItem(item("b"));

    await expect(loadRecentItems()).resolves.toEqual([item("b"), item("a")]);
  });

  it("保存されていないときと、壊れているときは空にする", async () => {
    await expect(loadRecentItems()).resolves.toEqual([]);

    await AsyncStorage.setItem("epiclese_recent_items_v1", "{broken");
    await expect(loadRecentItems()).resolves.toEqual([]);
  });
});
