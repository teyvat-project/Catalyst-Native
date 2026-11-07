import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EpicleseItemResponse, EpicleseStatusMetadataResponse } from "@natsuneko-laboratory/catalyst-sdk";
import {
  forgetRecentItem,
  loadRecentItems,
  MAX_RECENT_ITEMS,
  pickCreatedItems,
  pushRecentItems,
  recordCreatedItems,
  recordRecentItems,
  type RecentItem,
} from "./epiclese-recent-items";

jest.mock("@react-native-async-storage/async-storage");

const item = (id: string): RecentItem => ({
  id,
  type: "cloth",
  name: `item ${id}`,
  author: { id: "author-1", name: "Shop" },
});

const response = (id: string): EpicleseItemResponse => ({
  ...item(id),
  description: "long description",
  externalUrl: null,
  imageUrl: null,
  author: { id: "author-1", platformIdentifier: "shop", platform: null, name: "Shop" },
});

beforeEach(() => {
  resetAsyncStorageMock();
});

describe("pushRecentItems", () => {
  it("新しく使ったアイテムを先頭に入れる", () => {
    expect(pushRecentItems([item("a"), item("b")], [item("c"), item("d")]).map(({ id }) => id)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("同じアイテムは前のものを消して先頭に入れ直す", () => {
    const renamed = { ...item("b"), name: "renamed" };
    expect(pushRecentItems([item("a"), item("b")], [renamed, renamed])).toEqual([renamed, item("a")]);
  });

  it("表示と絞り込みに要らない値は持たない", () => {
    expect(pushRecentItems([], [response("a")])).toEqual([item("a")]);
  });

  it("上限を超えたら古いものから捨てる", () => {
    const full = Array.from({ length: MAX_RECENT_ITEMS }, (_, i) => item(String(i)));
    const next = pushRecentItems(full, [item("new")]);

    expect(next).toHaveLength(MAX_RECENT_ITEMS);
    expect(next[0].id).toBe("new");
    expect(next.at(-1)?.id).toBe(String(MAX_RECENT_ITEMS - 2));
  });
});

describe("pickCreatedItems", () => {
  const pin = (reference?: string) => ({ x: 0, y: 0, order: 0, type: "cloth" as const, name: "", reference });
  const saved = (id: string) => ({ ...response(id), x: 0, y: 0, order: 0, reference: id });

  it("送ったときに id が無かったアイテムだけを拾う", () => {
    expect(
      pickCreatedItems([{ id: "m1", reference: [pin("old"), pin()] }], {
        m1: { reference: [saved("old"), saved("new")] },
      } as unknown as EpicleseStatusMetadataResponse),
    ).toEqual([{ ...item("new"), author: response("new").author }]);
  });

  it("保存の結果のキーの順ではなく、送った写真の順に拾う", () => {
    expect(
      pickCreatedItems(
        [
          { id: "m2", reference: [pin()] },
          { id: "m1", reference: [pin()] },
          { id: "m3", reference: [] },
        ],
        {
          m1: { reference: [saved("a")] },
          m2: { reference: [saved("b")] },
        } as unknown as EpicleseStatusMetadataResponse,
      ).map(({ id }) => id),
    ).toEqual(["b", "a"]);
  });
});

describe("recent items storage", () => {
  it("記録したアイテムを新しい順に読み出す", async () => {
    await recordRecentItems([item("a")]);
    await recordRecentItems([item("b")]);

    await expect(loadRecentItems()).resolves.toEqual([item("b"), item("a")]);
  });

  it("続けて記録しても、先に記録したものを消さない", async () => {
    await Promise.all([recordRecentItems([item("a")]), recordRecentItems([item("b")]), loadRecentItems()]);

    await expect(loadRecentItems()).resolves.toEqual([item("b"), item("a")]);
  });

  it("保存の結果が想定と違う形でも、例外を投げずに失敗として返す", async () => {
    const record = () => recordCreatedItems([{ id: "m1", reference: [] }], null as never);

    expect(record).not.toThrow();
    await expect(record()).rejects.toThrow();
    // 失敗したあとも、続く読み書きは止まらない
    await recordRecentItems([item("a")]);
    await expect(loadRecentItems()).resolves.toEqual([item("a")]);
  });

  it("外したアイテムは読み出さない", async () => {
    await recordRecentItems([item("a"), item("b")]);
    await forgetRecentItem("a");

    await expect(loadRecentItems()).resolves.toEqual([item("b")]);
  });

  it("保存されていないときと、壊れているときは空にする", async () => {
    await expect(loadRecentItems()).resolves.toEqual([]);

    await AsyncStorage.setItem("epiclese_recent_items_v1", "{broken");
    await expect(loadRecentItems()).resolves.toEqual([]);
  });
});
