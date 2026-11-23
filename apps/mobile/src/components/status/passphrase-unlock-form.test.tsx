import { fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";

import { PassphraseUnlockForm } from "@/components/status/passphrase-unlock-form";
import { accountAtom } from "@/models/atoms/account";
import { passphraseUnlockRevisionAtomFamily } from "@/models/atoms/passphrase";

jest.mock("@/models/credential", () => ({ login: jest.fn() }));
jest.mock("@/components/design-system", () => {
  const { Pressable, Text, TextInput } = jest.requireActual("react-native");
  return {
    CatalystButton: ({ disabled, onPress, children }: { disabled?: boolean; onPress: () => void; children: never }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}>
        {children}
      </Pressable>
    ),
    CatalystButtonIcon: () => null,
    CatalystButtonText: Text,
    CatalystText: Text,
    CatalystTextField: TextInput,
  };
});
jest.mock("uniwind", () => ({ withUniwind: (component: unknown) => component }));
jest.mock("lucide-react-native", () => ({ LogIn: () => null }));

const unlockedStatus = { id: "s1", body: "本文", medias: [] };

const renderForm = async (unlock?: jest.Mock) => {
  const store = createStore();
  if (unlock) {
    const client = { catalyst: { v1: { status: { id: { unlock: { create: unlock } } } } } };
    store.set(accountAtom, { user: { id: "viewer" }, credential: { client } } as never);
  }
  const onUnlocked = jest.fn();

  await render(
    <Provider store={store}>
      <PassphraseUnlockForm statusId="s1" authorId="author" onUnlocked={onUnlocked} />
    </Provider>,
  );

  return { store, onUnlocked };
};

const submit = async (passphrase: string) => {
  await fireEvent.changeText(screen.getByLabelText("合言葉"), passphrase);
  await fireEvent.press(screen.getByText("解除"));
};

describe("PassphraseUnlockForm", () => {
  it("未ログインなら入力欄を出さず、ログインを促す", async () => {
    await renderForm();

    expect(screen.getByText("ログインして合言葉を入力")).toBeTruthy();
    expect(screen.queryByLabelText("合言葉")).toBeNull();
  });

  it("入力をそのまま送り、解除できたら投稿を渡して同じ投稿者のカードに知らせる", async () => {
    const unlock = jest.fn(async () => ({ data: { status: unlockedStatus }, response: { status: 200 } }));
    const { store, onUnlocked } = await renderForm(unlock);

    await submit(" ＡＢＣ ");

    expect(unlock).toHaveBeenCalledWith({ path: { id: "s1" }, body: { passphrase: " ＡＢＣ " } });
    expect(onUnlocked).toHaveBeenCalledWith(unlockedStatus);
    expect(store.get(passphraseUnlockRevisionAtomFamily("author"))).toBe(1);
  });

  it.each([
    [403, "合言葉が違います"],
    [429, "入力回数が上限に達しました。しばらくしてからお試しください"],
    [500, "解除に失敗しました"],
  ])("%i が返ったらその旨を出す", async (statusCode, message) => {
    const unlock = jest.fn(async () => ({ data: undefined, error: {}, response: { status: statusCode } }));
    const { store, onUnlocked } = await renderForm(unlock);

    await submit("wrong");

    expect(screen.getByText(message)).toBeTruthy();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(store.get(passphraseUnlockRevisionAtomFamily("author"))).toBe(0);
  });

  it("空白だけでは送らない", async () => {
    const unlock = jest.fn();
    await renderForm(unlock);

    await submit("   ");

    expect(unlock).not.toHaveBeenCalled();
  });
});
