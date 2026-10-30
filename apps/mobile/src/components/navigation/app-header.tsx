import { CatalystText } from "@/components/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "expo-router";
import type { NativeStackHeaderProps } from "expo-router/build/react-navigation/native-stack/types";
import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const UniChevronLeft = withUniwind(ChevronLeft);

type HeaderItemProps = {
  canGoBack?: boolean;
};

type CatalystAppHeaderProps = {
  compact?: boolean;
  backLabel?: string;
  canGoBack?: boolean;
  left?: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
  /** セーフエリアの左右を避けるか。設定画面の左のサイドバーのように、ステータス表示 (iPhone Duo では右上) まで届かない場所では false にする */
  sideInsets?: boolean;
  title?: React.ReactNode;
};

export const CatalystAppHeader = ({
  compact = false,
  backLabel = "戻る",
  canGoBack = false,
  left,
  onBack,
  right,
  sideInsets = true,
  title,
}: CatalystAppHeaderProps) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isDarkMode = theme.dark;

  return (
    <View
      className="border-b border-light-divider bg-light-background dark:border-dark-divider dark:bg-dark-background border-b-transparent"
      testID="catalyst-app-header"
      style={{
        paddingTop: insets.top,
        paddingLeft: sideInsets ? insets.left : 0,
        paddingRight: sideInsets ? insets.right : 0,
      }}
    >
      <View className="h-[52px] flex-row items-center px-3">
        <View className={cn("items-start justify-center", !compact && "w-[112px]")}>
          {left ??
            (canGoBack ? (
              <Pressable
                accessibilityLabel={backLabel}
                accessibilityRole="button"
                className={cn(
                  "min-h-9 max-w-[108px] flex-row items-center rounded-lg pr-3",
                  isDarkMode && "active:bg-dark-surface-muted",
                  !isDarkMode && "active:bg-light-surface-muted",
                )}
                hitSlop={8}
                onPress={onBack}
              >
                <UniChevronLeft className="text-light-tint dark:text-dark-tint" size={24} />
                <CatalystText className="shrink text-light-tint dark:text-dark-tint" numberOfLines={1} variant="label">
                  {backLabel}
                </CatalystText>
              </Pressable>
            ) : null)}
        </View>

        <View className="min-w-0 flex-1 items-center justify-center px-2">
          {typeof title === "string" ? (
            <CatalystText className="text-center" numberOfLines={1} variant="subtitle">
              {title}
            </CatalystText>
          ) : (
            title
          )}
        </View>

        <View className={cn("flex-row items-center justify-end", !compact && "w-[112px]")}>{right}</View>
      </View>
    </View>
  );
};

export const renderCatalystStackHeader = ({ back, navigation, options, route }: NativeStackHeaderProps) => {
  const canGoBack = !!back;
  const headerItemProps: HeaderItemProps = { canGoBack };
  const title = typeof options.headerTitle === "string" ? options.headerTitle : (options.title ?? route.name);
  const titleNode =
    typeof options.headerTitle === "function"
      ? options.headerTitle({
          children: title,
          tintColor: options.headerTintColor,
        })
      : title;

  return (
    <CatalystAppHeader
      backLabel={options.headerBackTitle ?? back?.title ?? "戻る"}
      canGoBack={canGoBack}
      left={options.headerLeft?.({
        ...headerItemProps,
        href: back?.href,
        label: options.headerBackTitle ?? back?.title,
      })}
      onBack={navigation.goBack}
      right={options.headerRight?.(headerItemProps)}
      title={titleNode}
    />
  );
};

export const headerSurfaceOptions = {
  header: renderCatalystStackHeader,
  headerShadowVisible: false,
  headerStyle: {
    backgroundColor: "transparent",
  },
  headerTintColor: undefined,
};
