import { CatalystDivider, CatalystText } from "@/components/design-system";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react-native";
import { Children, Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, View, type AccessibilityActionEvent } from "react-native";
import { withUniwind } from "uniwind";

const UniCheck = withUniwind(Check);

// 選ぶ画面の一覧は、設定画面 (app/settings/display.tsx) と同じ見た目にする。
// 一覧の背景を一段暗くし、行はその上の明るい面にまとめ、見出しは面の外に置く。
// 「最近使った〜」と「〜一覧」の境目が、背景の濃さと見出しの両方で分かるようにするため
export const PICK_LIST_CLASS = "bg-light-surface-muted dark:bg-dark-background";
export const PICK_ROW_CLASS = "bg-light-background dark:bg-dark-surface";

// 一覧の先頭の見出しは、検索欄との間が空きすぎないよう first で上の余白を詰める
export const SectionLabel = ({ children, first = false }: { children: string; first?: boolean }) => (
  <CatalystText
    variant="caption"
    tone="subtle"
    accessibilityRole="header"
    className={cn("px-4 pb-2", first ? "pt-1" : "pt-5")}
  >
    {children}
  </CatalystText>
);

// 行の間の区切り線。設定画面と同じく左を空け、空いたところも行の面の色にする
export const PickSeparator = () => (
  <View className={PICK_ROW_CLASS}>
    <CatalystDivider className="ml-4 w-auto" />
  </View>
);

// 一覧の外に並べる行 (最近使ったものなど) を、区切り線を挟んで 1 つの面にまとめる
export const PickGroup = ({ children }: { children: ReactNode }) => (
  <View>
    {Children.toArray(children).map((row, index) => (
      <Fragment key={index}>
        {index > 0 && <PickSeparator />}
        {row}
      </Fragment>
    ))}
  </View>
);

// 行の右端。取り直している間はスピナー、選択中ならチェックを出す
export const PickTrailing = ({ verifying, selected }: { verifying: boolean; selected: boolean }) =>
  verifying ? (
    <ActivityIndicator colorClassName="accent-light-tint dark:accent-dark-tint" />
  ) : (
    selected && <UniCheck size={20} className="text-light-tint dark:text-dark-tint" />
  );

// 履歴の行を長押しすると、確かめてから 1 件だけ消す。読み上げでは長押しの代わりに操作の一覧から選べるようにする。
// まとめて消す手段は、間違えて全部消してしまわないよう用意しない
export const forgetOnLongPress = ({
  name,
  section,
  onForget,
}: {
  name: string;
  section: string;
  onForget: () => void;
}) => {
  const confirm = () =>
    Alert.alert("履歴から削除しますか？", `「${name}」を${section}から外します`, [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: onForget },
    ]);

  return {
    onLongPress: confirm,
    accessibilityActions: [{ name: "forget", label: "履歴から削除" }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "forget") confirm();
    },
  };
};

type FetchResult<T> = { data?: T; response?: { status: number } } | null;

// 履歴のものは、あとからサーバーで削除・非表示になっていたり、名前などが変わっていたりする。
// 選ぶときに、手元に新しい値 (検索結果) が無ければ取り直して確かめ、無くなっていれば履歴から外して知らせる。
// 確かめている間はほかの行も受け付けない。確かめている行は、選び直しで履歴に戻らないよう長押しで消せない
export const useRefetchOnPick = <T,>({
  kind,
  fetch,
  onGone,
}: {
  // 「アイテム」「ワールド」など、知らせる文言に使う
  kind: string;
  fetch: (id: string) => Promise<FetchResult<T>>;
  onGone: (id: string) => void;
}) => {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  // 確かめている pick の番号。押した直後の 2 回目の押下は再描画より先に届くことがあるので ref で持つ。
  // 止めたあとや次の pick を始めたあとに届いた古い結果は、番号が合わないので捨てる
  const pendingRef = useRef<number | null>(null);
  const counterRef = useRef(0);
  const isBusy = () => pendingRef.current !== null;
  // 確かめている間に画面を離れたり閉じたりしたら、あとから届いた結果で書き換えない
  const cancel = () => {
    pendingRef.current = null;
    setVerifyingId(null);
  };
  useEffect(
    () => () => {
      pendingRef.current = null;
    },
    [],
  );

  const pick = async (id: string, fresh: T | undefined, onPicked: (value: T) => void) => {
    if (isBusy()) return;
    if (fresh) return onPicked(fresh);

    const token = ++counterRef.current;
    pendingRef.current = token;
    setVerifyingId(id);
    const result = await fetch(id).catch(() => null);
    if (pendingRef.current !== token) return;
    pendingRef.current = null;
    setVerifyingId(null);

    if (result?.data) return onPicked(result.data);
    if (result?.response?.status === 404) {
      onGone(id);
      Alert.alert(`この${kind}は削除されています`, `最近使った${kind}から外しました`);
      return;
    }
    Alert.alert("エラー", `${kind}を読み込めませんでした`);
  };

  return { verifyingId, pick, cancel, isBusy };
};
