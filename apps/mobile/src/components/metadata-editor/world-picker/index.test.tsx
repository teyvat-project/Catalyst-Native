import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import { Alert } from "react-native";

import { accountAtom } from "@/models/atoms/account";
import type { EditableWorld } from "@/models/epiclese-metadata-editor";
import { loadRecentWorlds, type RecentWorld } from "@/models/epiclese-recent-worlds";
import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import { forgetByLongPress } from "@/test/helpers/forget-by-long-press";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { WorldPickerModal } from ".";

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
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: jest.requireActual("react-native").ScrollView,
}));

const platform = { id: "p-vrchat", name: "VRChat", description: "", url: null, startAt: null };
const otherPlatform = { id: "p-resonite", name: "Resonite", description: "", url: null, startAt: null };
const author = { id: "a-1", platformIdentifier: "usr_1", platform, name: "Author" };

const world = (id: string, name: string) => ({ id, platformIdentifier: `wrld_${id}`, platform, name, author });

const seedRecentWorlds = (platformId: string, worlds: RecentWorld[]) =>
  AsyncStorage.setItem(`epiclese_recent_worlds_v1:${platformId}`, JSON.stringify(worlds));

const renderPicker = async ({
  results = [] as ReturnType<typeof world>[],
  value = undefined as EditableWorld | undefined,
} = {}) => {
  const client = {
    epiclese: {
      v1: {
        worlds: { get: jest.fn(async () => ({ data: { items: results } })), create: jest.fn(), id: { get: jest.fn() } },
        authors: { get: jest.fn(async () => ({ data: { items: [author] } })) },
      },
    },
  };
  const store = createStore();
  store.set(accountAtom, { user: { id: "me" }, credential: { client } } as never);
  const onCancel = jest.fn();
  const onSelect = jest.fn();

  const element = (visible: boolean) => (
    <Provider store={store}>
      <WorldPickerModal
        visible={visible}
        platform={platform}
        platforms={[platform, otherPlatform]}
        value={value}
        onCancel={onCancel}
        onSelect={onSelect}
      />
    </Provider>
  );
  const view = await render(element(true));
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  const setVisible = async (visible: boolean) => {
    await view.rerender(element(visible));
  };

  return { client, onCancel, onSelect, setVisible };
};

const fillWorldForm = async () => {
  await fireEvent.press(screen.getByText("見つからない場合はワールドを登録"));
  await fireEvent.changeText(screen.getByPlaceholderText("Avatar Testing Chamber"), "Home");
  await fireEvent.changeText(screen.getByPlaceholderText("wrld_a5e9ec13-36b1-4e63-ae0c-dab9023401f9"), "wrld_1");
};

const pressHardwareBack = async () => {
  await fireEvent(screen.getByTestId("world-picker-modal"), "requestClose");
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

describe("WorldPickerModal", () => {
  it("作者を選びに行って戻っても、登録フォームの入力を保持する", async () => {
    await renderPicker();

    await fireEvent.press(screen.getByText("見つからない場合はワールドを登録"));
    await fireEvent.changeText(screen.getByPlaceholderText("Avatar Testing Chamber"), "Home");
    await fireEvent.changeText(screen.getByPlaceholderText("wrld_a5e9ec13-36b1-4e63-ae0c-dab9023401f9"), "wrld_1");

    await fireEvent.press(screen.getByText("未選択"));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await fireEvent.press(screen.getByText("Author"));

    expect(screen.getByDisplayValue("Home")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("wrld_1")).toBeOnTheScreen();
    expect(screen.getByText("Author")).toBeOnTheScreen();
  });

  it("別のプラットフォームのワールドが返ってきたら選ばずに知らせる", async () => {
    const { client, onSelect } = await renderPicker();
    client.epiclese.v1.worlds.create.mockResolvedValue({
      data: { world: { id: "w-1", platformIdentifier: "wrld_1", platform: otherPlatform, name: "Home", author: null } },
    } as never);

    await fillWorldForm();
    await fireEvent.press(screen.getByText("保存"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("エラー", expect.stringContaining("Resonite"));
    expect(screen.getByDisplayValue("Home")).toBeOnTheScreen();
  });

  it("Android の戻る操作では 1 つ前のステップに戻る", async () => {
    const { onCancel } = await renderPicker();

    await fillWorldForm();
    await fireEvent.press(screen.getByText("未選択"));
    await pressHardwareBack();

    expect(screen.getByDisplayValue("Home")).toBeOnTheScreen();
    expect(onCancel).not.toHaveBeenCalled();

    await pressHardwareBack();
    expect(screen.getByPlaceholderText("ワールド名もしくは ID を入力...")).toBeOnTheScreen();

    await pressHardwareBack();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("選んだワールドを、そのプラットフォームの最近使ったワールドに入れる", async () => {
    const { onSelect } = await renderPicker({ results: [world("w-1", "Home")] });

    await fireEvent.press(screen.getByText("Home"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "w-1" }));
    await expect(loadRecentWorlds(platform.id)).resolves.toEqual([
      { id: "w-1", name: "Home", author: { id: "a-1", name: "Author" } },
    ]);
    await expect(loadRecentWorlds(otherPlatform.id)).resolves.toEqual([]);
  });

  it("検索欄が空なら最近使ったワールドを先頭に出し、選択中ならそこにチェックを付けて二重に出さない", async () => {
    await seedRecentWorlds(platform.id, [{ id: "w-1", name: "Home", author: null }]);
    await seedRecentWorlds(otherPlatform.id, [{ id: "w-9", name: "Other platform", author: null }]);
    const selected = { id: "w-1", platformIdentifier: "wrld_w-1", platform: platform.id, name: "Home", author: null };
    await renderPicker({ results: [world("w-1", "Home"), world("w-2", "Park")], value: selected });

    expect(screen.getByText("最近使ったワールド")).toBeOnTheScreen();
    expect(screen.getByText("ワールド一覧")).toBeOnTheScreen();
    expect(screen.getAllByText("Home")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Home/, selected: true })).toBeOnTheScreen();
    expect(screen.queryByText("Other platform")).toBeNull();
  });

  it("検索結果に無い最近使ったワールドは、取り直してから選ぶ", async () => {
    await seedRecentWorlds(platform.id, [{ id: "w-1", name: "Old name", author: null }]);
    const { client, onSelect } = await renderPicker();
    client.epiclese.v1.worlds.id.get.mockResolvedValue({ data: { world: world("w-1", "New name") } });

    await fireEvent.press(screen.getByText("Old name"));

    expect(client.epiclese.v1.worlds.id.get).toHaveBeenCalledWith({ path: { id: "w-1" } });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "w-1", name: "New name" }));
  });

  it("サーバーで消えた最近使ったワールドは、選ぶと履歴から外して知らせる", async () => {
    await seedRecentWorlds(platform.id, [{ id: "gone", name: "Gone", author: null }]);
    const { client, onSelect } = await renderPicker();
    client.epiclese.v1.worlds.id.get.mockResolvedValue({ data: undefined, response: { status: 404 } });

    await fireEvent.press(screen.getByText("Gone"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("このワールドは削除されています", "最近使ったワールドから外しました");
    expect(screen.queryByText("Gone")).toBeNull();
    await expect(loadRecentWorlds(platform.id)).resolves.toEqual([]);
  });

  it("最近使ったワールドは長押しで確かめてから履歴から外す", async () => {
    await seedRecentWorlds(platform.id, [{ id: "w-1", name: "Home", author: null }]);
    await renderPicker();

    await forgetByLongPress("Home");
    expect(alert).toHaveBeenLastCalledWith(
      "履歴から削除しますか？",
      "「Home」を最近使ったワールドから外します",
      expect.any(Array),
    );

    expect(screen.queryByText("Home")).toBeNull();
    await expect(loadRecentWorlds(platform.id)).resolves.toEqual([]);
  });

  it("最近使ったワールドを確かめている間は、ほかの行を受け付けず、閉じたあとに届いた結果では選ばない", async () => {
    await seedRecentWorlds(platform.id, [{ id: "w-1", name: "Old name", author: null }]);
    const { client, onSelect, onCancel, setVisible } = await renderPicker({ results: [world("w-2", "Park")] });
    let resolveWorld!: (value: unknown) => void;
    client.epiclese.v1.worlds.id.get.mockReturnValue(new Promise((resolve) => (resolveWorld = resolve)));

    await fireEvent.press(screen.getByText("Old name"));
    await fireEvent.press(screen.getByText("Park"));
    expect(onSelect).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("キャンセル"));
    // 親が閉じても、iOS では閉じるアニメーションの間は中身が残る
    await setVisible(false);
    await act(async () => {
      resolveWorld({ data: { world: world("w-1", "New name") } });
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("選択中のワールドが最近使ったワールドにあって検索結果に無いときは、押しても取り直さずに閉じる", async () => {
    await seedRecentWorlds(platform.id, [{ id: "w-1", name: "Home", author: null }]);
    const selected = { id: "w-1", platformIdentifier: "wrld_w-1", platform: platform.id, name: "Home", author: null };
    const { client, onCancel, onSelect } = await renderPicker({ value: selected });

    await fireEvent.press(screen.getByText("Home"));

    expect(client.epiclese.v1.worlds.id.get).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
