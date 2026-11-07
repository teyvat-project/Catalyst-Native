import type { EmojiCategory, EmojiItem } from "@natsuneko-laboratory/react-native-emoji-verse";
import { renderHook } from "@testing-library/react-native";
import { matchPickerEmojis, useIntelligenceSearchProvider } from "./intelligence-search";

const unicode = (emoji: string): EmojiItem => ({ id: emoji, type: { kind: "unicode", emoji }, keywords: [] });

const categories: EmojiCategory[] = [
  {
    id: "custom",
    title: "Custom",
    icon: "star",
    emojis: [{ id: ":party:", type: { kind: "url", url: "https://example.com/party.png" }, keywords: ["party"] }],
  },
  { id: "travel", title: "Travel", icon: "plane", emojis: [unicode("🏖"), unicode("🍺")] },
  { id: "food", title: "Food", icon: "utensils", emojis: [unicode("🍺")] },
];

describe("matchPickerEmojis", () => {
  it("paimon の並び順のまま、ピッカーにある絵文字に置き換える", () => {
    expect(matchPickerEmojis([{ emoji: "🍺" }, { emoji: "🏖" }], categories)).toEqual([unicode("🍺"), unicode("🏖")]);
  });

  it("U+FE0F の有無が違っても同じ絵文字として扱う", () => {
    expect(matchPickerEmojis([{ emoji: "🏖️" }], categories)).toEqual([unicode("🏖")]);
  });

  it("ピッカーにない絵文字と、重複した絵文字は捨てる", () => {
    expect(matchPickerEmojis([{ emoji: "🧟" }, { emoji: "🍺" }, { emoji: "🍺" }], categories)).toEqual([unicode("🍺")]);
  });
});

// 探した結果はモジュールの中で覚えるので、テストごとに別の言葉で探す
describe("useIntelligenceSearchProvider", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const { signal } = new AbortController();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("探した結果を覚えておき、peek で待たずに返す", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [{ emoji: "🍺" }] }) });
    const { result } = await renderHook(() => useIntelligenceSearchProvider(categories));

    expect(result.current.peek?.("乾杯")).toBeUndefined();
    await expect(result.current.search("乾杯", { signal })).resolves.toEqual({ items: [unicode("🍺")] });
    expect(result.current.peek?.("乾杯")).toEqual({ items: [unicode("🍺")] });
    // 描画のたびに呼ばれても、同じカテゴリなら同じ結果を返し、一覧を描き直させない
    expect(result.current.peek?.("乾杯")).toBe(result.current.peek?.("乾杯"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("カテゴリが変わっても覚えた結果を使い、そのときのカテゴリの絵文字に置き換える", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [{ emoji: "🍺" }] }) });
    const { result, rerender } = await renderHook(({ c }: { c: EmojiCategory[] }) => useIntelligenceSearchProvider(c), {
      initialProps: { c: categories },
    });
    await result.current.search("おつかれ", { signal });

    const beer = { ...unicode("🍺"), keywords: ["beer"] };
    await rerender({ c: [{ id: "food", title: "Food", icon: "utensils", emojis: [beer] }] });

    expect(result.current.peek?.("おつかれ")).toEqual({ items: [beer] });
  });

  it("覚えた結果は、ほかの投稿で開いたピッカーとも共有する", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [{ emoji: "🍺" }] }) });
    const first = await renderHook(() => useIntelligenceSearchProvider(categories));
    await first.result.current.search("海", { signal });

    const second = await renderHook(() => useIntelligenceSearchProvider(categories));
    expect(second.result.current.peek?.("海")).toEqual({ items: [unicode("🍺")] });
  });

  it("キーワードの一致だけで探した結果は覚えない", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ emoji: "🍺" }], degraded: true }),
    });
    const { result } = await renderHook(() => useIntelligenceSearchProvider(categories));

    await expect(result.current.search("ビール", { signal })).resolves.toMatchObject({ items: [unicode("🍺")] });
    expect(result.current.peek?.("ビール")).toBeUndefined();
  });

  it("制限されたときの結果は覚えない", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { result } = await renderHook(() => useIntelligenceSearchProvider(categories));

    await expect(result.current.search("雨", { signal })).resolves.toMatchObject({ items: [] });
    expect(result.current.peek?.("雨")).toBeUndefined();
  });
});
