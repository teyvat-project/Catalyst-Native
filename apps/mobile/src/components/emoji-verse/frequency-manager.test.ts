import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import { getRecentItems, recordUnicodeUsage, recordUrlUsage } from "./frequency-manager";

jest.mock("@react-native-async-storage/async-storage");

describe("emoji frequency manager", () => {
  beforeEach(() => {
    resetAsyncStorageMock();
  });

  it("初期状態では空配列を返す", async () => {
    expect(await getRecentItems()).toEqual([]);
  });

  it("Unicode 絵文字の使用を記録すると先頭に追加される", async () => {
    await recordUnicodeUsage("😀");

    const items = await getRecentItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "unicode", value: "😀", id: "😀" });
  });

  it("カスタム絵文字 (URL) の使用を id/url で記録する", async () => {
    await recordUrlUsage("custom-1", "https://example.com/e.png");

    const items = await getRecentItems();
    expect(items[0]).toMatchObject({
      type: "url",
      value: "https://example.com/e.png",
      id: "custom-1",
    });
  });

  it("同じ絵文字を再度使うと重複せず先頭に移動する", async () => {
    await recordUnicodeUsage("😀");
    await recordUnicodeUsage("😂");
    await recordUnicodeUsage("😀");

    const items = await getRecentItems();
    expect(items.map((i) => i.id)).toEqual(["😀", "😂"]);
  });

  it("最大件数 (30件) を超えたら古いものから切り捨てる", async () => {
    for (let i = 0; i < 35; i++) {
      await recordUnicodeUsage(`emoji-${i}`);
    }

    const items = await getRecentItems();
    expect(items).toHaveLength(30);
    // 直近に使ったものが先頭、最も古い5件 (emoji-0〜emoji-4) が切り捨てられている
    expect(items[0].id).toBe("emoji-34");
    expect(items.some((i) => i.id === "emoji-0")).toBe(false);
  });
});
