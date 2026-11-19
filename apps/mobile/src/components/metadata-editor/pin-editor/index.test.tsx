import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

import { accountAtom } from "@/models/atoms/account";
import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import { forgetByLongPress } from "@/test/helpers/forget-by-long-press";
import type { EditablePin } from "@/models/epiclese-pin-editor";
import { loadRecentAuthors, type RecentAuthor } from "@/models/epiclese-recent-authors";
import { loadRecentItems, type RecentItem } from "@/models/epiclese-recent-items";
import type { Media } from "@/models/sdk-types";

import { PinEditorModal } from ".";

jest.mock("@react-native-async-storage/async-storage");
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: jest.requireActual("react-native").View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// design-system の index 経由で読まれる reanimated は jest 環境で初期化できないので、使わない部品ごと差し替える
jest.mock("@/components/design-system/switch", () => ({ CatalystSwitch: () => null }));
jest.mock("@/components/design-system/tabs", () => ({ CatalystTabs: () => null, usePagerGestures: () => ({}) }));
// gesture-handler は読み込み時に worklets の UI ランタイムを初期化しようとして jest では落ちる。
// ドラッグはここでは確かめない (手動確認) ので、素通しの部品に差し替える
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  const chain = (): unknown => new Proxy({}, { get: () => () => chain() });
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: chain },
  };
});
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: jest.requireActual("react-native").ScrollView,
}));

const media = { id: "m1", url: "https://example.com/m1", metadata: { width: 1000, height: 1000 } } as Media;
const platform = { id: "p-vrchat", name: "VRChat", description: "", url: null, startAt: null };
const pin = (i: number, overrides: Partial<EditablePin> = {}): EditablePin => ({
  x: 100 * i,
  y: 100 * i,
  order: i,
  type: "other",
  name: `Item ${i + 1}`,
  reference: `i-${i}`,
  ...overrides,
});
const pins = (n: number) => Array.from({ length: n }, (_, i) => pin(i));

const jacket = {
  id: "i-1",
  type: "cloth" as const,
  name: "Jacket",
  description: "",
  externalUrl: null,
  imageUrl: null,
  author: { id: "a-1", platformIdentifier: "usr_1", platform: null, name: "Author" },
};

const renderEditor = async (initialPins: EditablePin[]) => {
  const client = {
    epiclese: {
      v1: {
        items: {
          get: jest.fn(async () => ({ data: { items: [jacket] } })),
          id: { get: jest.fn() },
        },
        authors: {
          get: jest.fn(async () => ({ data: { items: [] as (typeof jacket.author)[] } })),
          id: { get: jest.fn() },
        },
      },
    },
  };
  const store = createStore();
  store.set(accountAtom, { user: { id: "me" }, credential: { client } } as never);
  const onCancel = jest.fn();
  const onDone = jest.fn();

  await render(
    <Provider store={store}>
      <PinEditorModal
        visible
        media={media}
        pins={initialPins}
        platform={platform}
        platforms={[platform]}
        onCancel={onCancel}
        onDone={onDone}
      />
    </Provider>,
  );
  await fireEvent(screen.getByTestId("pin-canvas"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
  });

  return { client, onCancel, onDone };
};

const seedRecentItems = (items: RecentItem[]) =>
  AsyncStorage.setItem("epiclese_recent_items_v1", JSON.stringify(items));

const seedRecentAuthors = (authors: RecentAuthor[]) =>
  AsyncStorage.setItem("epiclese_recent_authors_v1", JSON.stringify(authors));

const advanceSearch = () =>
  act(async () => {
    jest.advanceTimersByTime(300);
  });

const openItemSearch = async (x = 200, y = 200) => {
  await tapCanvas(x, y);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
};

const tapCanvas = async (x: number, y: number) => {
  await fireEvent.press(screen.getByTestId("pin-canvas"), { nativeEvent: { locationX: x, locationY: y } });
};

let alert: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  resetAsyncStorageMock();
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  alert.mockRestore();
});

describe("PinEditorModal", () => {
  it("21 件目は追加せず Alert を出す", async () => {
    const { onDone } = await renderEditor(pins(20));

    await tapCanvas(200, 200);
    expect(alert).toHaveBeenCalledWith("エラー", "写真1枚につき最大20件までピンを設定できます");

    await fireEvent.press(screen.getByText("完了"));
    expect(onDone.mock.calls[0][0]).toHaveLength(20);
  });

  it("入力が足りないピンがあると完了で反映しない", async () => {
    const { onDone } = await renderEditor([pin(0), pin(1, { name: "", reference: undefined })]);

    await fireEvent.press(screen.getByText("完了"));

    expect(onDone).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("エラー", "2 番のピンの入力が足りません");
  });

  it("キャンセルでは反映しない", async () => {
    const { onCancel, onDone } = await renderEditor(pins(1));

    await fireEvent.press(screen.getByLabelText("1 番のピンを削除"));
    await fireEvent.press(screen.getByText("キャンセル"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("並べ替えると order を振り直して返す", async () => {
    const { onDone } = await renderEditor(pins(3));

    await fireEvent.press(screen.getByLabelText("3 番のピンを上へ移動"));
    await fireEvent.press(screen.getByText("完了"));

    const result: EditablePin[] = onDone.mock.calls[0][0];
    expect(result.map((item) => [item.reference, item.order])).toEqual([
      ["i-0", 0],
      ["i-2", 1],
      ["i-1", 2],
    ]);
  });

  it("何も入力せずに戻った新しいピンは消える", async () => {
    const { onDone } = await renderEditor([]);

    await tapCanvas(200, 200);
    await fireEvent.press(screen.getByText("戻る"));
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone).toHaveBeenCalledWith([]);
  });

  it("アイテムを選ぶとピンに入る", async () => {
    const { onDone } = await renderEditor([]);

    await tapCanvas(200, 200);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText("衣装 · by Author")).toBeTruthy();
    await fireEvent.press(screen.getByText("Jacket"));
    // ピン一覧にも作者が出る
    expect(screen.getByText("衣装 · by Author")).toBeTruthy();
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone.mock.calls[0][0]).toEqual([
      {
        x: 5000,
        y: 5000,
        order: 0,
        reference: "i-1",
        type: "cloth",
        name: "Jacket",
        author: { id: "a-1", name: "Author", platformIdentifier: "usr_1", platform: "" },
      },
    ]);
  });

  it("選んだアイテムを、次のピンの検索で「最近使ったアイテム」として先頭に出す", async () => {
    await renderEditor([]);

    await tapCanvas(200, 200);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.queryByText("最近使ったアイテム")).toBeNull();
    await fireEvent.press(screen.getByText("Jacket"));

    // 写真の画面は作り直されるので、大きさを伝え直す
    await fireEvent(screen.getByTestId("pin-canvas"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
    });
    await tapCanvas(100, 100);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByText("最近使ったアイテム")).toBeTruthy();
    // 検索結果にも同じアイテムがあるが、二重には出さない
    expect(screen.getAllByText("Jacket")).toHaveLength(1);
    // 検索結果が全部最近使ったアイテムに入ったときは、空の一覧の見出しや「見つかりません」を出さない
    expect(screen.queryByText("アイテム一覧")).toBeNull();
    expect(screen.queryByText("該当するアイテムが見つかりません")).toBeNull();
  });

  it("検索結果に無い最近使ったアイテムは、選ぶときに取り直した値をピンに入れる", async () => {
    await seedRecentItems([{ id: "i-9", type: "cloth", name: "Old name", author: { id: "a-1", name: "Author" } }]);
    const { client, onDone } = await renderEditor([]);
    client.epiclese.v1.items.id.get.mockResolvedValue({ data: { item: { ...jacket, id: "i-9", name: "New name" } } });

    await openItemSearch();
    expect(screen.getByText("アイテム一覧")).toBeTruthy();
    await fireEvent.press(screen.getByText("Old name"));
    await fireEvent.press(screen.getByText("完了"));

    expect(client.epiclese.v1.items.id.get).toHaveBeenCalledWith({ path: { id: "i-9" } });
    expect(onDone.mock.calls[0][0][0]).toMatchObject({ reference: "i-9", name: "New name" });
    await expect(loadRecentItems()).resolves.toEqual([
      { id: "i-9", type: "cloth", name: "New name", author: { id: "a-1", name: "Author" } },
    ]);
  });

  it("サーバーで消えた最近使ったアイテムは、選ぶと履歴から外して知らせる", async () => {
    await seedRecentItems([{ id: "gone", type: "cloth", name: "Gone", author: { id: "a-1", name: "Author" } }]);
    const { client, onDone } = await renderEditor([]);
    client.epiclese.v1.items.id.get.mockResolvedValue({ data: undefined, response: { status: 404 } });

    await openItemSearch();
    await fireEvent.press(screen.getByText("Gone"));

    expect(alert).toHaveBeenCalledWith("このアイテムは削除されています", "最近使ったアイテムから外しました");
    expect(screen.queryByText("Gone")).toBeNull();
    await expect(loadRecentItems()).resolves.toEqual([]);
    await fireEvent.press(screen.getByText("戻る"));
    await fireEvent.press(screen.getByText("完了"));
    expect(onDone).toHaveBeenCalledWith([]);
  });

  it("確かめている間はほかの行を受け付けず、画面を離れたら届いた結果でピンを書き換えない", async () => {
    await seedRecentItems([{ id: "i-9", type: "cloth", name: "Old name", author: { id: "a-1", name: "Author" } }]);
    const { client, onDone } = await renderEditor(pins(1));
    let resolveItem!: (value: unknown) => void;
    client.epiclese.v1.items.id.get.mockReturnValue(new Promise((resolve) => (resolveItem = resolve)));

    await fireEvent.press(screen.getByText("Item 1"));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await fireEvent.press(screen.getByText("Old name"));
    await fireEvent.press(screen.getByText("Old name"));
    await fireEvent.press(screen.getByText("Jacket"));
    expect(client.epiclese.v1.items.id.get).toHaveBeenCalledTimes(1);
    // Jacket も受け付けていないので、まだアイテム検索の画面にいる
    expect(screen.getByText("アイテムを選択")).toBeTruthy();

    await fireEvent.press(screen.getByText("戻る"));
    await act(async () => {
      resolveItem({ data: { item: { ...jacket, id: "i-9", name: "New name" } } });
    });
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone.mock.calls[0][0]).toEqual(pins(1));
  });

  it("作者で絞り込むと、最近使ったアイテムもその作者のものだけにする", async () => {
    await seedRecentItems([
      { id: "r-1", type: "cloth", name: "Recent A", author: { id: "a-1", name: "Author" } },
      { id: "r-2", type: "cloth", name: "Recent B", author: { id: "a-2", name: "Other" } },
    ]);
    const { client } = await renderEditor([]);
    client.epiclese.v1.authors.get.mockResolvedValue({
      data: { items: [{ id: "a-2", platformIdentifier: "usr_2", platform: null, name: "Other" }] },
    });

    await openItemSearch();
    expect(screen.getByText("Recent A")).toBeTruthy();
    await fireEvent.press(screen.getByText("作者で絞り込む"));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await fireEvent.press(screen.getByText("Other"));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByText("Recent A")).toBeNull();
    expect(screen.getByText("Recent B")).toBeTruthy();
  });

  it("アイテムを選ぶとその作者も記録し、絞り込みで作者を選んだだけでは記録しない", async () => {
    const { client } = await renderEditor([]);
    client.epiclese.v1.authors.get.mockResolvedValue({
      data: { items: [{ id: "a-2", platformIdentifier: "usr_2", platform: null, name: "Other" }] },
    });

    await openItemSearch();
    await fireEvent.press(screen.getByText("作者で絞り込む"));
    await advanceSearch();
    await fireEvent.press(screen.getByText("Other"));
    await advanceSearch();
    await expect(loadRecentAuthors()).resolves.toEqual([]);

    await fireEvent.press(screen.getByText("Jacket"));
    await expect(loadRecentAuthors()).resolves.toEqual([{ id: "a-1", name: "Author", platformIdentifier: "usr_1" }]);
  });

  it("作者で絞り込むとき、検索欄が空なら最近使った作者を先頭に出し、選ぶと取り直してその作者で絞り込む", async () => {
    await seedRecentAuthors([{ id: "a-2", name: "Other", platformIdentifier: "usr_2" }]);
    const { client } = await renderEditor([]);
    client.epiclese.v1.authors.id.get.mockResolvedValue({
      data: { author: { id: "a-2", platformIdentifier: "usr_2", platform: null, name: "Renamed" } },
    });

    await openItemSearch();
    await fireEvent.press(screen.getByText("作者で絞り込む"));
    await advanceSearch();
    expect(screen.getByText("最近使った作者")).toBeTruthy();
    expect(screen.getByRole("button", { name: "すべての作者", selected: true })).toBeOnTheScreen();
    // 検索結果が空でも、最近使った作者があれば「見つかりませんでした」は出さない
    expect(screen.queryByText("一致する作者が見つかりませんでした。")).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText("作者名もしくは ID を入力..."), "x");
    await advanceSearch();
    expect(screen.queryByText("最近使った作者")).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText("作者名もしくは ID を入力..."), "");
    await advanceSearch();

    await fireEvent.press(screen.getByText("Other"));
    await advanceSearch();
    expect(client.epiclese.v1.authors.id.get).toHaveBeenCalledWith({ path: { id: "a-2" } });
    expect(screen.getByText("Renamed")).toBeTruthy();

    // 開き直すと、選んだ作者にチェックが付く (選ぶ前は「すべての作者」)
    await fireEvent.press(screen.getByText("作者で絞り込む"));
    await advanceSearch();
    expect(screen.getByRole("button", { name: /^Other/, selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "すべての作者", selected: false })).toBeOnTheScreen();
    expect(client.epiclese.v1.items.get).toHaveBeenLastCalledWith({
      query: { q: "", author: "a-2" },
      throwOnError: true,
    });
  });

  it("最近使ったアイテムは長押しで確かめてから履歴から外し、検索結果の一覧に戻す", async () => {
    await seedRecentItems([{ id: "i-1", type: "cloth", name: "Jacket", author: { id: "a-1", name: "Author" } }]);
    await renderEditor([]);

    await openItemSearch();
    expect(screen.getByText("最近使ったアイテム")).toBeTruthy();
    await forgetByLongPress("Jacket");

    expect(alert).toHaveBeenLastCalledWith(
      "履歴から削除しますか？",
      "「Jacket」を最近使ったアイテムから外します",
      expect.any(Array),
    );
    expect(screen.queryByText("最近使ったアイテム")).toBeNull();
    expect(screen.getByText("Jacket")).toBeTruthy();
    await expect(loadRecentItems()).resolves.toEqual([]);
  });

  it("検索結果の行は長押ししても履歴から外す確認を出さない", async () => {
    await renderEditor([]);

    await openItemSearch();
    await fireEvent(screen.getByText("Jacket"), "longPress");

    expect(alert).not.toHaveBeenCalled();
  });

  it("最近使った作者は長押しで確かめてから履歴から外す", async () => {
    await seedRecentAuthors([
      { id: "a-1", name: "Author", platformIdentifier: "usr_1" },
      { id: "a-2", name: "Other", platformIdentifier: "usr_2" },
    ]);
    await renderEditor([]);

    await openItemSearch();
    await fireEvent.press(screen.getByText("作者で絞り込む"));
    await advanceSearch();
    await forgetByLongPress("Other");

    expect(screen.queryByText("Other")).toBeNull();
    await expect(loadRecentAuthors()).resolves.toEqual([{ id: "a-1", name: "Author", platformIdentifier: "usr_1" }]);
  });

  it("新規作成で作者が無ければ完了で止まる", async () => {
    const { onDone } = await renderEditor([]);

    await tapCanvas(200, 200);
    await fireEvent.press(screen.getByText("新しいアイテムを作成"));
    await fireEvent.changeText(screen.getByPlaceholderText("例：ネオンジャケット"), "X");
    await fireEvent.press(screen.getByText("戻る"));
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("エラー", "1 番のピンの入力が足りません");
  });

  it("変更があるときにシートを閉じようとしたら確認し、すぐには閉じない", async () => {
    const { onCancel } = await renderEditor(pins(1));

    await fireEvent.press(screen.getByLabelText("1 番のピンを削除"));
    await fireEvent(screen.getByTestId("pin-editor-modal"), "requestClose");

    expect(onCancel).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("変更を破棄しますか？", undefined, expect.any(Array));
  });

  it("変更が無ければシートを閉じる操作でそのまま閉じる", async () => {
    const { onCancel } = await renderEditor(pins(1));

    await fireEvent(screen.getByTestId("pin-editor-modal"), "requestClose");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
