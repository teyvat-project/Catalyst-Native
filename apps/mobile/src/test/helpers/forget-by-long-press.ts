import { act, fireEvent, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

// 履歴の行を長押しし、出た確認の「削除」を押す。呼び出し側で Alert.alert を jest.spyOn しておくこと。
// 同じ文字が複数あるときは index で選ぶ (負の値は後ろから)
export const forgetByLongPress = async (text: string, index = 0) => {
  await fireEvent(screen.getAllByText(text).at(index)!, "longPress");
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    buttons.find((button) => button.text === "削除")?.onPress?.();
  });
};
