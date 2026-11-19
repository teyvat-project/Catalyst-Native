import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

import { accountAtom } from "@/models/atoms/account";
import type { UserProfile } from "@/models/epiclese-metadata-editor";
import { loadRecentUsers, type RecentUser } from "@/models/epiclese-recent-users";
import { resetAsyncStorageMock } from "@/test/helpers/async-storage";
import { forgetByLongPress } from "@/test/helpers/forget-by-long-press";

import { UserPickerModal } from "./user-picker-modal";

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

const searchResult = (id: string, displayName: string) => ({
  id,
  screenName: id,
  displayName,
  profile: {
    iconUrl: `https://cdn.natsuneko.com/icons/${id}`,
    bannerUrl: "",
    bio: "",
    website: "",
    additionalWebsites: [],
  },
});

const renderPicker = async ({
  users = [] as { id: string }[],
  profiles = {} as Record<string, UserProfile>,
  results = [] as ReturnType<typeof searchResult>[],
} = {}) => {
  const client = {
    egeria: {
      v1: {
        search: { get: jest.fn(async () => ({ data: { users: results } })) },
        user: { by: { id: { id: { get: jest.fn() } } } },
      },
    },
  };
  const store = createStore();
  store.set(accountAtom, { user: { id: "me" }, credential: { client } } as never);
  const onCancel = jest.fn();
  const onDone = jest.fn();

  const element = (visible: boolean) => (
    <Provider store={store}>
      <UserPickerModal visible={visible} users={users} profiles={profiles} onCancel={onCancel} onDone={onDone} />
    </Provider>
  );
  const view = await render(element(true));
  const setVisible = async (visible: boolean) => {
    await view.rerender(element(visible));
  };

  return { client, onCancel, onDone, setVisible };
};

const recent = (id: string, displayName: string): RecentUser => ({
  id,
  displayName,
  screenName: id,
  iconUrl: `https://cdn.natsuneko.com/icons/${id}/tiny`,
});

const seedRecentUsers = async (users: RecentUser[]) => {
  await AsyncStorage.setItem("epiclese_recent_users_v1", JSON.stringify(users));
};

const search = async (q: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText("表示名やユーザー名で検索..."), q);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
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

describe("UserPickerModal", () => {
  it("11 人目は追加せず、上限のメッセージを出す", async () => {
    const users = Array.from({ length: 10 }, (_, i) => ({ id: `u${i + 1}` }));
    const { onDone } = await renderPicker({ users, results: [searchResult("u11", "Eleven")] });

    await search("ele");
    await fireEvent.press(screen.getByText("Eleven"));

    expect(screen.getByText("最大 10 人まで選べます")).toBeOnTheScreen();

    await fireEvent.press(screen.getByText("完了"));
    expect(onDone.mock.calls[0][0]).toEqual(users);
  });

  it("キャンセルでは反映しない", async () => {
    const { onCancel, onDone } = await renderPicker({ results: [searchResult("u1", "One")] });

    await search("one");
    await fireEvent.press(screen.getByText("One"));
    await fireEvent.press(screen.getByText("キャンセル"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("完了で選んだ人と表示用の情報を返す", async () => {
    const { onDone } = await renderPicker({ results: [searchResult("u1", "One")] });

    await search("one");
    await fireEvent.press(screen.getByText("One"));
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone).toHaveBeenCalledWith([{ id: "u1" }], {
      u1: { displayName: "One", screenName: "u1", iconUrl: "https://cdn.natsuneko.com/icons/u1/tiny" },
    });
  });

  it("完了のときに今回新しく追加した人だけを、後から追加した人ほど先頭にして記録する", async () => {
    await seedRecentUsers([recent("u9", "Nine")]);
    const { onDone } = await renderPicker({
      users: [{ id: "u0" }],
      profiles: { u0: { displayName: "Zero", screenName: "u0", iconUrl: null } },
      results: [searchResult("u1", "One"), searchResult("u2", "Two")],
    });

    await search("o");
    await fireEvent.press(screen.getByText("One"));
    await fireEvent.press(screen.getByText("Two"));
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone).toHaveBeenCalled();
    expect((await loadRecentUsers()).map(({ id }) => id)).toEqual(["u2", "u1", "u9"]);
  });

  it("キャンセルでは最近使ったユーザーに記録しない", async () => {
    await renderPicker({ results: [searchResult("u1", "One")] });

    await search("one");
    await fireEvent.press(screen.getByText("One"));
    await fireEvent.press(screen.getByText("キャンセル"));

    await expect(loadRecentUsers()).resolves.toEqual([]);
  });

  it("検索欄が空なら最近使ったユーザーを出し、追加するときに取り直した値を使う", async () => {
    await seedRecentUsers([recent("u1", "Old name")]);
    const { client, onDone } = await renderPicker();
    client.egeria.v1.user.by.id.id.get.mockResolvedValue({ data: { user: searchResult("u1", "New name") } });
    await search("");

    expect(screen.getByText("最近使ったユーザー")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Old name"));
    await fireEvent.press(screen.getByText("完了"));

    expect(client.egeria.v1.user.by.id.id.get).toHaveBeenCalledWith({ path: { id: "u1" } });
    expect(onDone).toHaveBeenCalledWith([{ id: "u1" }], {
      u1: { displayName: "New name", screenName: "u1", iconUrl: "https://cdn.natsuneko.com/icons/u1/tiny" },
    });
    await expect(loadRecentUsers()).resolves.toEqual([recent("u1", "New name")]);
  });

  it("選択中の最近使ったユーザーを押すと、取り直さずに外す", async () => {
    await seedRecentUsers([recent("u1", "One")]);
    const { client, onDone } = await renderPicker({
      users: [{ id: "u1" }],
      profiles: { u1: { displayName: "One", screenName: "u1", iconUrl: null } },
    });
    await search("");

    await fireEvent.press(screen.getAllByText("One").at(-1)!);
    await fireEvent.press(screen.getByText("完了"));

    expect(client.egeria.v1.user.by.id.id.get).not.toHaveBeenCalled();
    expect(onDone.mock.calls[0][0]).toEqual([]);
  });

  it("上限まで選んでいるときは、取り直さずに上限のメッセージを出す", async () => {
    await seedRecentUsers([recent("u11", "Eleven")]);
    const users = Array.from({ length: 10 }, (_, i) => ({ id: `u${i + 1}` }));
    const { client } = await renderPicker({ users });
    await search("");

    await fireEvent.press(screen.getByText("Eleven"));

    expect(client.egeria.v1.user.by.id.id.get).not.toHaveBeenCalled();
    expect(screen.getByText("最大 10 人まで選べます")).toBeOnTheScreen();
  });

  it("サーバーで消えた最近使ったユーザーは、押すと履歴から外して知らせる", async () => {
    await seedRecentUsers([recent("gone", "Gone")]);
    const { client, onDone } = await renderPicker();
    client.egeria.v1.user.by.id.id.get.mockResolvedValue({ data: undefined, response: { status: 404 } });
    await search("");

    await fireEvent.press(screen.getByText("Gone"));

    expect(alert).toHaveBeenCalledWith("このユーザーは削除されています", "最近使ったユーザーから外しました");
    expect(screen.queryByText("Gone")).toBeNull();
    await expect(loadRecentUsers()).resolves.toEqual([]);
    await fireEvent.press(screen.getByText("完了"));
    expect(onDone.mock.calls[0][0]).toEqual([]);
  });

  it("最近使ったユーザーは長押しで確かめてから履歴から外す", async () => {
    await seedRecentUsers([recent("u1", "One"), recent("u2", "Two")]);
    await renderPicker();
    await search("");

    await forgetByLongPress("One");
    expect(alert).toHaveBeenLastCalledWith(
      "履歴から削除しますか？",
      "「One」を最近使ったユーザーから外します",
      expect.any(Array),
    );

    expect(screen.queryByText("One")).toBeNull();
    await expect(loadRecentUsers()).resolves.toEqual([recent("u2", "Two")]);
  });

  it("取り直している間は、検索結果の行と「完了」を受け付けず、届いた結果で追加する", async () => {
    await seedRecentUsers([recent("u1", "Recent one")]);
    const { client, onDone } = await renderPicker({ results: [searchResult("u1", "One")] });
    let resolveUser!: (value: unknown) => void;
    client.egeria.v1.user.by.id.id.get.mockReturnValue(new Promise((resolve) => (resolveUser = resolve)));
    await search("");

    await fireEvent.press(screen.getByText("Recent one"));
    await search("one");
    await fireEvent.press(screen.getByText("One"));
    await fireEvent.press(screen.getByText("完了"));
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      resolveUser({ data: { user: searchResult("u1", "One") } });
    });
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone.mock.calls[0][0]).toEqual([{ id: "u1" }]);
  });

  it("取り直している間に閉じて開き直したら、届いた結果で今回の下書きを書き換えない", async () => {
    await seedRecentUsers([recent("u1", "One")]);
    const { client, onDone, setVisible } = await renderPicker();
    let resolveUser!: (value: unknown) => void;
    client.egeria.v1.user.by.id.id.get.mockReturnValue(new Promise((resolve) => (resolveUser = resolve)));
    await search("");

    await fireEvent.press(screen.getByText("One"));
    await setVisible(false);
    await setVisible(true);
    await act(async () => {
      resolveUser({ data: { user: searchResult("u1", "One") } });
    });
    await fireEvent.press(screen.getByText("完了"));

    expect(onDone.mock.calls[0][0]).toEqual([]);
  });

  it("今回の操作の間に履歴から外した人は、追加していても「完了」で記録し直さない", async () => {
    await seedRecentUsers([recent("u1", "One")]);
    const { client } = await renderPicker();
    client.egeria.v1.user.by.id.id.get.mockResolvedValue({ data: { user: searchResult("u1", "One") } });
    await search("");

    await fireEvent.press(screen.getByText("One"));
    await forgetByLongPress("One", -1);
    await fireEvent.press(screen.getByText("完了"));

    await expect(loadRecentUsers()).resolves.toEqual([]);
  });

  it("履歴から外したあとで自分で足し直した人は、「完了」でまた記録する", async () => {
    await seedRecentUsers([recent("u1", "One")]);
    await renderPicker({ results: [searchResult("u1", "One")] });
    await search("");

    await forgetByLongPress("One");
    await search("one");
    await fireEvent.press(screen.getByText("One"));
    await fireEvent.press(screen.getByText("完了"));

    expect((await loadRecentUsers()).map(({ id }) => id)).toEqual(["u1"]);
  });
});
