import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { Alert, Pressable } from "react-native";

import StatusMetadataScreen from "@/app/status/[id]/metadata";
import { accountAtom } from "@/models/atoms/account";

// 画面のロジック (読み込み・保存・破棄確認) だけを見るため、ネイティブ依存の部品とルーターは差し替える
const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() };
const mockHeader: { right?: () => ReactNode } = {};
const mockPreventRemove: { prevent: boolean; callback?: (event: { repeat: () => void }) => void } = {
  prevent: false,
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "s1" }),
  useRouter: () => mockRouter,
  usePreventRemove: (prevent: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.prevent = prevent;
    mockPreventRemove.callback = callback;
  },
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) => {
      if (options?.headerRight) mockHeader.right = options.headerRight;
      return null;
    },
  },
}));

jest.mock("@/components/metadata-editor/photo-pager", () => ({ PhotoPager: () => null }));
jest.mock("@/components/metadata-editor/thumbnail-strip", () => ({ ThumbnailStrip: () => null }));
jest.mock("@/components/metadata-editor/apply-to-all-sheet", () => ({ ApplyToAllSheet: () => null }));
jest.mock("@/components/metadata-editor/platform-sheet", () => ({ PlatformSheet: () => null }));
jest.mock("@/components/metadata-editor/metadata-row", () => ({ MetadataRow: () => null }));
jest.mock("@/components/metadata-editor/user-picker-modal", () => ({ UserPickerModal: () => null }));
jest.mock("@/components/metadata-editor/world-picker", () => ({ WorldPickerModal: () => null }));
jest.mock("@/components/metadata-editor/pin-editor", () => ({ PinEditorModal: () => null }));
jest.mock("@/components/design-system", () => {
  const { Pressable, Text, View } = jest.requireActual("react-native");
  return {
    CatalystAvatar: View,
    CatalystButton: View,
    CatalystButtonIcon: View,
    CatalystButtonText: Text,
    CatalystDivider: View,
    CatalystEmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    CatalystSwitch: ({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) => (
      <Pressable
        testID="privacy-switch"
        accessibilityState={{ checked: value }}
        onPress={() => onValueChange(!value)}
      />
    ),
    CatalystText: Text,
  };
});
jest.mock("uniwind", () => ({ withUniwind: (component: unknown) => component }));
jest.mock("lucide-react-native", () => ({
  Copy: () => null,
  EyeOff: () => null,
  MapPin: () => null,
  Users: () => null,
}));

const createClient = () => ({
  catalyst: {
    v11: {
      status: {
        id: {
          get: jest.fn(async () => ({
            data: { status: { user: { id: "u1" }, medias: [{ id: "m1", url: "https://example.com/m1" }] } },
          })),
        },
      },
    },
  },
  epiclese: {
    v1: {
      tag: { by: { status: { id: { get: jest.fn(async () => ({ data: {} })), create: jest.fn() } } } },
      platforms: { get: jest.fn(async () => ({ data: { platforms: [] } })) },
    },
  },
});

const renderScreen = async () => {
  const client = createClient();
  const store = createStore();
  const account = { user: { id: "u1" }, credential: { client, accessToken: "a", refreshToken: "r" } };
  store.set(accountAtom, account as never);

  await render(
    <Provider store={store}>
      <StatusMetadataScreen />
    </Provider>,
  );
  await screen.findByTestId("privacy-switch");

  return { client, store, account };
};

const pressSave = async () => {
  const header = mockHeader.right?.() as React.ReactElement<React.ComponentProps<typeof Pressable>>;
  await act(async () => {
    header.props.onPress?.({} as never);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  delete mockHeader.right;
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("StatusMetadataScreen", () => {
  it("トークン更新でアカウントが差し替わっても、読み込み直して編集内容を捨てない", async () => {
    const { client, store, account } = await renderScreen();

    await fireEvent.press(screen.getByTestId("privacy-switch"));
    expect(screen.getByTestId("privacy-switch").props.accessibilityState.checked).toBe(true);

    await act(async () => {
      store.set(accountAtom, { ...account, credential: { ...account.credential, accessToken: "a2" } } as never);
    });

    expect(client.catalyst.v11.status.id.get).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("privacy-switch").props.accessibilityState.checked).toBe(true);
  });

  it("保存中に離れようとしても破棄確認を出さず、画面を離れさせない", async () => {
    const { client } = await renderScreen();
    client.epiclese.v1.tag.by.status.id.create.mockImplementation(() => new Promise(() => {}));

    await fireEvent.press(screen.getByTestId("privacy-switch"));
    await pressSave();

    expect(client.epiclese.v1.tag.by.status.id.create).toHaveBeenCalledTimes(1);
    expect(mockPreventRemove.prevent).toBe(true);

    const repeat = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat }));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(repeat).not.toHaveBeenCalled();
  });
});
