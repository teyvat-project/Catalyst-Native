import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { Check, CircleAlert, Info, TriangleAlert, X } from "lucide-react-native";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast, { type ToastConfig, type ToastConfigParams, type ToastShowParams } from "react-native-toast-message";
import { withUniwind } from "uniwind";
import { CatalystText } from "./text";
import { CatalystSurface } from "./surface";

const CloseIcon = withUniwind(X);
const variants = {
  success: {
    Icon: withUniwind(Check),
    background: "bg-light-success-background dark:bg-dark-success-background",
    foreground: "accent-light-success-foreground dark:accent-dark-success-foreground",
    label: "成功",
  },
  error: {
    Icon: withUniwind(CircleAlert),
    background: "bg-light-error-background dark:bg-dark-error-background",
    foreground: "accent-light-error-foreground dark:accent-dark-error-foreground",
    label: "エラー",
  },
  info: {
    Icon: withUniwind(Info),
    background: "bg-light-info-background dark:bg-dark-info-background",
    foreground: "accent-light-info-foreground dark:accent-dark-info-foreground",
    label: "お知らせ",
  },
  warning: {
    Icon: withUniwind(TriangleAlert),
    background: "bg-light-warning-background dark:bg-dark-warning-background",
    foreground: "accent-light-warning-foreground dark:accent-dark-warning-foreground",
    label: "注意",
  },
};

type ToastVariant = keyof typeof variants;
type CatalystToastCardProps = Pick<ToastConfigParams<unknown>, "text1" | "text2" | "onPress" | "hide"> &
  Partial<Pick<ToastConfigParams<unknown>, "position">> & {
    variant: ToastVariant;
  };

export function CatalystToastCard({ variant, text1, text2, onPress, hide, position }: CatalystToastCardProps) {
  const { Icon, background, foreground, label } = variants[variant];
  const insets = useSafeAreaInsets();
  // 上に出るトーストは、狭い画面だと端まで届いてステータス表示 (iPhone Duo では右上) と重なるので、セーフエリアの左右を避ける
  const sideInsets =
    position === "top" ? { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right } : undefined;

  return (
    <View testID="catalyst-toast-card" className="w-full max-w-lg px-4" style={sideInsets}>
      <CatalystSurface
        variant="elevated"
        radius="lg"
        className="flex-row items-center border border-light-divider p-2 shadow-lg dark:border-dark-divider"
      >
        <Pressable
          onPress={onPress}
          accessibilityLabel={[label, text1, text2].filter(Boolean).join("。")}
          accessibilityLiveRegion={variant === "error" ? "assertive" : "polite"}
          className="min-w-0 flex-1 flex-row items-center gap-3 rounded-lg p-2 active:opacity-80"
        >
          <View
            accessible={false}
            className={cn("size-9 shrink-0 items-center justify-center rounded-full", background)}
          >
            <Icon size={20} strokeWidth={2} colorClassName={foreground} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            {text1 ? (
              <CatalystText variant="label" className="leading-5">
                {text1}
              </CatalystText>
            ) : null}
            {text2 ? (
              <CatalystText tone={text1 ? "muted" : "default"} className="leading-5">
                {text2}
              </CatalystText>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="通知を閉じる"
          onPress={() => hide()}
          className="size-11 shrink-0 items-center justify-center rounded-full active:bg-light-surface-muted dark:active:bg-dark-surface-muted"
        >
          <CloseIcon size={18} colorClassName="accent-light-icon dark:accent-dark-icon" />
        </Pressable>
      </CatalystSurface>
    </View>
  );
}

const toastConfig: ToastConfig = {
  success: (props) => <CatalystToastCard {...props} variant="success" />,
  error: (props) => <CatalystToastCard {...props} variant="error" />,
  info: (props) => <CatalystToastCard {...props} variant="info" />,
  warning: (props) => <CatalystToastCard {...props} variant="warning" />,
};

function announceToast({ text1, text2 }: ToastShowParams) {
  // Android uses the card's live region; VoiceOver needs an explicit announcement.
  const message = [text1, text2].filter(Boolean).join("。");
  if (Platform.OS === "ios" && message) AccessibilityInfo.announceForAccessibility(message);
}

export function CatalystToast() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <Toast
      config={toastConfig}
      topOffset={insets.top + 12}
      bottomOffset={insets.bottom + 12}
      onShow={announceToast}
      animationConfig={{ type: "timing", duration: reducedMotion ? 0 : 220 }}
    />
  );
}
