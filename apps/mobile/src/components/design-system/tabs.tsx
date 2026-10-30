import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { CatalystDivider } from "./divider";
import { CatalystText } from "./text";

const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

export type CatalystTab = {
  key: string;
  label: string;
};

/**
 * The pager's own gestures, published to the scenes inside it. A horizontal drag that starts on a
 * scene's own horizontally-swipeable content (an image carousel with several images) must not reach
 * the pager, so that content blocks these instead of letting the pager win by default. Empty outside
 * CatalystTabs.
 */
const PagerGesturesContext = React.createContext<GestureType[]>([]);
export const usePagerGestures = () => React.useContext(PagerGesturesContext);

export type CatalystTabsProps = {
  tabs: CatalystTab[];
  renderScene: (tab: CatalystTab) => React.ReactNode;
  defaultIndex?: number;
  onTabChange?: (tab: CatalystTab, index: number) => void;
  onSwipeRightFromStart?: () => void;
  swipeRightThreshold?: number;
  /** タブを文字の幅で並べ、収まらない分はタブバーを横スクロールさせる */
  scrollable?: boolean;
};

type TabFrame = { x: number; width: number };

export function CatalystTabs({
  tabs,
  renderScene,
  defaultIndex = 0,
  onTabChange,
  onSwipeRightFromStart,
  swipeRightThreshold = 70,
  scrollable = false,
}: CatalystTabsProps) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  // ページとタブバーの幅は画面幅ではなく実際に描画された幅を使う。セーフエリアの余白や設定画面の左右分割で、
  // 画面幅とずれることがあるため。最初の onLayout までは画面幅で代用する
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [barWidth, setBarWidth] = useState(windowWidth);
  const [scrollX] = useState(() => new Animated.Value(defaultIndex * windowWidth));
  const flatListRef = useRef<FlatList<CatalystTab>>(null);
  const isScrollingProgrammatically = useRef(false);
  const tabBarRef = useRef<ScrollViewInstance>(null);
  const [measuredFrames, setMeasuredFrames] = useState<(TabFrame | undefined)[]>([]);

  // iPhone Duo の開閉などで幅が変わると、スクロール位置は古い幅のまま残る。
  // 選択中のタブを基準に、ページと下線の位置を新しい幅に合わせ直す
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const lastPageWidth = useRef(pageWidth);
  useEffect(() => {
    if (lastPageWidth.current === pageWidth) return;
    lastPageWidth.current = pageWidth;
    const offset = activeIndexRef.current * pageWidth;
    flatListRef.current?.scrollToOffset({ offset, animated: false });
    scrollX.setValue(offset);
  }, [pageWidth, scrollX]);

  // 均等幅のときはタブの位置を計算で求め、横スクロールのときは実際に描画された位置を使う
  const tabWidth = barWidth / tabs.length;
  const frames = scrollable ? measuredFrames : tabs.map((_, i) => ({ x: i * tabWidth, width: tabWidth }));
  const isMeasured = tabs.every((_, i) => frames[i]);
  const indicatorWidthOf = (i: number) => Math.min(64, Math.max(36, (frames[i]?.width ?? 0) * 0.44));

  const inputRange = tabs.map((_, i) => i * pageWidth);
  const indicatorWidth = scrollX.interpolate({
    inputRange,
    outputRange: tabs.map((_, i) => indicatorWidthOf(i)),
    extrapolate: "clamp",
  });
  const indicatorTranslateX = scrollX.interpolate({
    inputRange,
    outputRange: tabs.map((_, i) => (frames[i]?.x ?? 0) + ((frames[i]?.width ?? 0) - indicatorWidthOf(i)) / 2),
    extrapolate: "clamp",
  });

  // 選んだタブが端で見切れているときだけ、隣のタブが少し覗く位置までタブバーをスクロールする。
  // 見えているタブでもスクロールさせると、タブバーの動きとインジケーターの動きが重なって揺れて見える
  const tabBarScrollX = useRef(0);
  const activeFrame = scrollable ? measuredFrames[activeIndex] : undefined;
  useEffect(() => {
    if (!activeFrame) return;
    const margin = 48;
    const left = tabBarScrollX.current;
    let x: number | null = null;
    if (activeFrame.x < left) {
      x = Math.max(0, activeFrame.x - margin);
    } else if (activeFrame.x + activeFrame.width > left + pageWidth) {
      x = activeFrame.x + activeFrame.width + margin - pageWidth;
    }
    if (x !== null) {
      tabBarRef.current?.scrollTo({ x, animated: !reducedMotion });
    }
  }, [activeFrame, pageWidth, reducedMotion]);

  const handleTabPress = (index: number) => {
    isScrollingProgrammatically.current = true;
    setActiveIndex(index);
    onTabChange?.(tabs[index]!, index);
    // インジケーターはページのスクロール位置 (scrollX) に追従させる。ここで scrollX を別にアニメーションさせると、
    // ゆっくり動き出すスクロールの位置で上書きされて、インジケーターが行き来してしまう
    flatListRef.current?.scrollToIndex({ index, animated: !reducedMotion });
  };

  const handleScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false });

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isScrollingProgrammatically.current) {
      isScrollingProgrammatically.current = false;
      return;
    }
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / pageWidth);
    const clampedIndex = Math.max(0, Math.min(index, tabs.length - 1));
    if (clampedIndex !== activeIndex) {
      setActiveIndex(clampedIndex);
      onTabChange?.(tabs[clampedIndex]!, clampedIndex);
    }
  };

  // Android の ScrollView は ACTION_CANCEL を受けるとページングのスナップをせず途中で止まるため、
  // スクロール開始後は内側のカルーセルやドロワーの Pan に割り込まれないようにする
  const nativeScrollGesture = useMemo(() => Gesture.Native().disallowInterruption(true), []);

  const swipeRightGesture = useMemo(() => {
    const callback = onSwipeRightFromStart;
    return Gesture.Pan()
      .enabled(activeIndex === 0 && !!callback)
      .activeOffsetX(20)
      .failOffsetX(-20)
      .onEnd((e) => {
        if (callback && e.translationX > swipeRightThreshold && e.velocityX >= 0) {
          runOnJS(callback)();
        }
      });
  }, [activeIndex, onSwipeRightFromStart, swipeRightThreshold]);

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(swipeRightGesture, nativeScrollGesture),
    [swipeRightGesture, nativeScrollGesture],
  );

  const pagerGestures = useMemo<GestureType[]>(
    () => [nativeScrollGesture, swipeRightGesture],
    [nativeScrollGesture, swipeRightGesture],
  );

  const renderItem: ListRenderItem<CatalystTab> = ({ item }) => (
    <View style={{ width: pageWidth, flex: 1 }}>{renderScene(item)}</View>
  );

  const tabBar = (
    <View
      className="relative flex-row"
      onLayout={
        scrollable
          ? undefined
          : (e) => {
              const { width } = e.nativeEvent.layout;
              if (width > 0) setBarWidth(width);
            }
      }
    >
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className={cn("h-12 items-center justify-center", scrollable ? "px-4" : "flex-1")}
            onPress={() => handleTabPress(index)}
            onLayout={
              scrollable
                ? (e) => {
                    const { x, width } = e.nativeEvent.layout;
                    setMeasuredFrames((prev) => {
                      const next = [...prev];
                      next[index] = { x, width };
                      return next;
                    });
                  }
                : undefined
            }
          >
            <CatalystText
              variant="label"
              tone={isActive ? "default" : "subtle"}
              className={isActive ? "font-bold" : undefined}
            >
              {tab.label}
            </CatalystText>
          </Pressable>
        );
      })}
      {scrollable ? null : <CatalystDivider className="absolute bottom-0" />}
      <Animated.View
        className="absolute bottom-0 h-1 rounded-full bg-light-accent dark:bg-dark-accent"
        style={[
          {
            width: indicatorWidth,
            opacity: isMeasured ? 1 : 0,
            transform: [{ translateX: indicatorTranslateX }],
          },
        ]}
      />
    </View>
  );

  return (
    <PagerGesturesContext.Provider value={pagerGestures}>
      <View className="flex-1">
        {scrollable ? (
          // 区切り線はスクロールさせず、画面幅いっぱいに引く
          <View>
            <CatalystDivider className="absolute bottom-0" />
            <ScrollView
              ref={tabBarRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                tabBarScrollX.current = e.nativeEvent.contentOffset.x;
              }}
            >
              {tabBar}
            </ScrollView>
          </View>
        ) : (
          tabBar
        )}

        <View
          testID="catalyst-tabs-pager"
          className="flex-1"
          onLayout={(e) => {
            // 幅 0 の layout (表示前など) を使うと、ページ位置の計算が 0 除算になる
            const { width } = e.nativeEvent.layout;
            if (width > 0) setPageWidth(width);
          }}
        >
          <GestureDetector gesture={composedGesture}>
            <AnimatedFlatList
              ref={flatListRef}
              testID="catalyst-tabs-list"
              data={tabs}
              extraData={pageWidth}
              horizontal
              pagingEnabled
              scrollEnabled
              bounces={false}
              overScrollMode="never"
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              getItemLayout={(_, index) => ({
                length: pageWidth,
                offset: pageWidth * index,
                index,
              })}
              initialScrollIndex={defaultIndex}
              scrollEventThrottle={16}
              onScroll={handleScroll}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              // タブを押したスクロールで完了の通知が来ない場合に備え、次にユーザーが動かしたらフラグを下ろす
              onScrollBeginDrag={() => {
                isScrollingProgrammatically.current = false;
              }}
              className="flex-1"
            />
          </GestureDetector>
        </View>
      </View>
    </PagerGesturesContext.Provider>
  );
}
