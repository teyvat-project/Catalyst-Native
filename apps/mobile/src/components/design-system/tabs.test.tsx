import { fireEvent, render, screen } from "@testing-library/react-native";
import { FlatList, Text } from "react-native";
import { CatalystTabs } from "./tabs";

// tabs.tsx が reanimated から使うのは runOnJS だけ。reanimated 本体は jest では読み込めない
jest.mock("react-native-reanimated", () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));
// gesture-handler は読み込み時に worklets の UI ランタイムを初期化しようとして jest では落ちる。
// スワイプのジェスチャーはここでは確かめない (手動確認) ので、素通しの部品に差し替える
jest.mock("react-native-gesture-handler", () => {
  const chain = (): unknown => new Proxy({}, { get: () => () => chain() });
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: chain, Native: chain, Simultaneous: chain },
  };
});

// iPhone Duo を開いた状態と同じく、右にステータス表示の余白があるものとして描画する
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 84, bottom: 34, left: 0 }),
}));

const tabs = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
];

const layout = (width: number) => ({
  nativeEvent: { layout: { width, height: 600, x: 0, y: 0 } },
});

const renderTabs = (defaultIndex: number) =>
  render(<CatalystTabs tabs={tabs} defaultIndex={defaultIndex} renderScene={(tab) => <Text>{tab.label}</Text>} />);

describe("CatalystTabs", () => {
  let scrollToOffset: jest.SpyInstance;

  beforeEach(() => {
    scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset").mockImplementation(() => {});
  });

  afterEach(() => {
    scrollToOffset.mockRestore();
  });

  it("幅が変わると選択中のページに合わせ直す", async () => {
    await renderTabs(1);
    const pager = screen.getByTestId("catalyst-tabs-pager");
    await fireEvent(pager, "layout", layout(951));
    await fireEvent(pager, "layout", layout(466));
    expect(scrollToOffset).toHaveBeenLastCalledWith({
      offset: 466,
      animated: false,
    });
  });

  it("最後のタブを選んだまま幅が縮んでも最後のページに合う", async () => {
    await renderTabs(2);
    const pager = screen.getByTestId("catalyst-tabs-pager");
    await fireEvent(pager, "layout", layout(951));
    await fireEvent(pager, "layout", layout(466));
    expect(scrollToOffset).toHaveBeenLastCalledWith({
      offset: 932,
      animated: false,
    });
  });

  it("スワイプ途中で幅が変わっても activeIndex に合わせる", async () => {
    await renderTabs(0);
    const pager = screen.getByTestId("catalyst-tabs-pager");
    await fireEvent(pager, "layout", layout(951));
    await fireEvent.scroll(screen.getByTestId("catalyst-tabs-list"), {
      nativeEvent: {
        contentOffset: { x: 500, y: 0 },
        contentSize: { width: 2853, height: 600 },
        layoutMeasurement: { width: 951, height: 600 },
      },
    });
    await fireEvent(pager, "layout", layout(466));
    expect(scrollToOffset).toHaveBeenLastCalledWith({
      offset: 0,
      animated: false,
    });
  });

  it("タブバーはセーフエリアの左右を避ける", async () => {
    await renderTabs(0);
    expect(screen.getByTestId("catalyst-tabs-bar")).toHaveStyle({ paddingLeft: 0, paddingRight: 84 });
  });

  it("幅 0 の layout は無視する", async () => {
    await renderTabs(1);
    const pager = screen.getByTestId("catalyst-tabs-pager");
    await fireEvent(pager, "layout", layout(951));
    const calls = scrollToOffset.mock.calls.length;
    await fireEvent(pager, "layout", layout(0));
    expect(scrollToOffset).toHaveBeenCalledTimes(calls);
  });
});
