import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";

import { accountAtom } from "@/models/atoms/account";

import { AuthorSearchStep } from "./author-search-step";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// design-system の index 経由で読まれる reanimated は jest 環境で初期化できないので、使わない部品ごと差し替える
jest.mock("@/components/design-system/switch", () => ({ CatalystSwitch: () => null }));
jest.mock("@/components/design-system/tabs", () => ({ CatalystTabs: () => null, usePagerGestures: () => ({}) }));

const renderStep = async (props: Partial<React.ComponentProps<typeof AuthorSearchStep>> = {}) => {
  const client = { epiclese: { v1: { authors: { get: jest.fn(async () => ({ data: { items: [] } })) } } } };
  const store = createStore();
  store.set(accountAtom, { user: { id: "me" }, credential: { client } } as never);

  await render(
    <Provider store={store}>
      <AuthorSearchStep onBack={jest.fn()} onSelect={jest.fn()} {...props} />
    </Provider>,
  );
  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  return { client };
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("AuthorSearchStep", () => {
  it("platform なしなら全プラットフォームで検索する", async () => {
    const { client } = await renderStep();

    expect(client.epiclese.v1.authors.get).toHaveBeenCalledWith({ query: { q: "" }, throwOnError: true });
  });

  it("allOption を先頭に出し、選ぶと onSelect が呼ばれる", async () => {
    const onSelectAll = jest.fn();
    await renderStep({ allOption: { label: "すべての作者", onSelect: onSelectAll } });

    await fireEvent.press(screen.getByText("すべての作者"));

    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("onRegister が無ければ登録の導線を出さない", async () => {
    await renderStep();

    expect(screen.queryByText("見つからない場合は作者を登録")).toBeNull();
  });
});
