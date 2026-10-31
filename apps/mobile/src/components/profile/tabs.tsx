import { CatalystText } from "@/components/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Animated, Pressable, View, useWindowDimensions } from "react-native";

type Props = {
  activeIndex: number;
  tabs: { route: string; label: string }[];
  onClickTab: (index: number) => void;
};

export const ProfileTabs = ({ activeIndex, tabs, onClickTab }: Props) => {
  const { width: windowWidth } = useWindowDimensions();
  // 親にセーフエリアの余白が入ることがあるので、画面幅ではなく実際に描画された幅で割る
  const [barWidth, setBarWidth] = useState(windowWidth);
  const [indicator] = useState(() => new Animated.Value(0));
  const tabWidth = barWidth / tabs.length;
  const theme = useTheme();
  const isDarkMode = theme.dark;

  const handleTabClick = useCallback(
    (i: number) => {
      onClickTab?.(i);

      Animated.timing(indicator, {
        toValue: i * tabWidth,
        duration: 200,
        useNativeDriver: false,
      }).start();
    },
    [indicator, onClickTab, tabWidth],
  );

  useEffect(() => {
    indicator.setValue(activeIndex * tabWidth);
  }, [activeIndex, indicator, tabWidth]);

  return (
    <View
      className="flex-1 flex-row bg-light-background dark:bg-dark-surface"
      onLayout={(e) => {
        const { width } = e.nativeEvent.layout;
        if (width > 0) setBarWidth(width);
      }}
    >
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;

        return (
          <Pressable
            className={cn(
              "items-center justify-center py-3.5",
              isDarkMode && "active:bg-dark-surface-muted",
              !isDarkMode && "active:bg-light-surface-muted"
            )}
            key={tab.route}
            style={{ width: tabWidth }}
            onPress={() => handleTabClick(i)}
          >
            <CatalystText
              variant="label"
              tone={isActive ? "default" : "muted"}
              className={cn(
                "text-center",
                isActive ? "font-bold" : "font-semibold",
              )}
            >
              {tab.label}
            </CatalystText>
          </Pressable>
        );
      })}
      <Animated.View
        className="absolute bottom-0 h-0.5 rounded-full bg-light-accent dark:bg-dark-accent"
        style={{ transform: [{ translateX: indicator }], width: tabWidth }}
      />
    </View>
  );
};
