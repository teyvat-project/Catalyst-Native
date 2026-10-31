import { render, screen } from "@testing-library/react-native";
import { CatalystAppHeader } from "./app-header";

jest.mock("expo-router", () => ({ useTheme: () => ({ dark: false }) }));
// design-system の index は expo-image まで読み込み、jest では読み込めないので文字だけ差し替える
jest.mock("@/components/design-system", () => ({ CatalystText: jest.requireActual("react-native").Text }));
// Icon drawing is native-library behavior; these tests cover the header's layout.
jest.mock("lucide-react-native", () => ({ ChevronLeft: jest.requireActual("react-native").View }));
// iPhone Duo を開いた状態と同じく、右にステータス表示の余白があるものとして描画する
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 84, bottom: 34, left: 0 }),
}));

describe("CatalystAppHeader", () => {
  it("上端にステータスバーがないときも、角に掛からないよう上を空ける", async () => {
    await render(<CatalystAppHeader title="ホーム" />);
    expect(screen.getByTestId("catalyst-app-header")).toHaveStyle({ paddingTop: 12 });
  });

  it("画面上部に置くときはセーフエリアの左右を避ける", async () => {
    await render(<CatalystAppHeader title="設定とプライバシー" />);
    expect(screen.getByTestId("catalyst-app-header")).toHaveStyle({ paddingLeft: 0, paddingRight: 84 });
  });

  it("画面の端に接しない場所では左右のセーフエリアを足さない", async () => {
    await render(<CatalystAppHeader title="設定とプライバシー" sideInsets={false} />);
    expect(screen.getByTestId("catalyst-app-header")).toHaveStyle({ paddingLeft: 0, paddingRight: 0 });
  });
});
