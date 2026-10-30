import { ProfileBanner, ProfileHeader } from "@/components/profile/header";
import { ProfileOverlay } from "@/components/profile/overlay";
import { TabContent } from "@/components/profile/tab-content";
import { ProfileTabs } from "@/components/profile/tabs";
import { UserTimelineHandle } from "@/components/profile/timeline";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { accountAtom } from "@/models/atoms/account";
import { clientAtom } from "@/models/atoms/credential";
import type {
  CatalystRelationships,
  EgeriaUser,
  ProfileTag,
} from "@/models/sdk-types";
import { useScrollToTop } from "expo-router/react-navigation";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  type ScrollViewInstance,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = {
  route: string;
  label: string;
};

const DEFAULT_TABS: Tab[] = [
  { route: "posts", label: "投稿" },
  { route: "gallery", label: "ギャラリー" },
  { route: "album", label: "アルバム" },
];

const LOAD_MORE_THRESHOLD = 200;
const PULL_INDICATOR_DISTANCE = 72;

type Props = {
  screenName: string;
  showBackButton?: boolean;
};

export function ProfilePage({ screenName, showBackButton = true }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const account = useAtomValue(accountAtom);
  const client = useAtomValue(clientAtom);
  const [user, setUser] = useState<EgeriaUser | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isStickyTabBarInteractive, setIsStickyTabBarInteractive] =
    useState(false);
  const NAV_BAR_HEIGHT = insets.top + 44;
  const isMyself = user?.id === account?.user.id;
  const tabContentRef = useRef<UserTimelineHandle>(null);
  const [relationships, setRelationships] =
    useState<CatalystRelationships | null>(null);
  const [initialTags, setInitialTags] = useState<ProfileTag[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tabs: Tab[] = useMemo(
    () =>
      [...DEFAULT_TABS, isMyself && { route: "likes", label: "いいね" }]
        .filter(Boolean)
        .map((w) => w as unknown as Tab),
    [isMyself],
  );
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .runOnJS(true)
    .onEnd((event) => {
      const { translationX, velocityX } = event;
      if (translationX < -50 || velocityX < -300) {
        setActiveTab((prev) => Math.min(prev + 1, tabs.length - 1));
      } else if (translationX > 50 || velocityX > 300) {
        setActiveTab((prev) => Math.max(prev - 1, 0));
      }
    });

  const view = useRef<ScrollViewInstance>(null);
  const scroller = useRef<{ scrollToTop: () => void }>(null);
  const scrollActiveTimelineToTopHandler = useMemo(() => {
    return {
      scrollToTop: () => {
        view.current?.scrollTo({ x: 0, y: 0, animated: true });
      },
    };
  }, []);
  useEffect(() => {
    scroller.current = scrollActiveTimelineToTopHandler;
  }, [scrollActiveTimelineToTopHandler]);

  useScrollToTop(scroller);

  // The sticky tab bar overlay is visually hidden (opacity 0) until the header
  // scrolls out of view. `isStickyTabBarInteractive` tracks whether it is
  // actually visible so it can stay non-interactive while hidden — otherwise the
  // invisible bar sits over the banner area and swallows taps, which on Android
  // manifested as tapping the banner switching the profile tab (#10).
  // It is updated from `handleScroll` below.

  const stickyTabBarOpacity =
    headerHeight > 0
      ? scrollY.interpolate({
          inputRange: [headerHeight - 104, headerHeight - 103],
          outputRange: [0, 1],
          extrapolate: "clamp",
        })
      : 0;
  const pullIndicatorOpacity = scrollY.interpolate({
    inputRange: [-PULL_INDICATOR_DISTANCE, -16, 0],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp",
  });
  const pullIndicatorScale = scrollY.interpolate({
    inputRange: [-PULL_INDICATOR_DISTANCE, -16, 0],
    outputRange: [1, 0.82, 0.72],
    extrapolate: "clamp",
  });

  useAsyncEffect(async () => {
    if (!screenName) {
      return;
    }

    const accountUser =
      account?.user.screenName === screenName ? account.user : null;

    if (accountUser) {
      const tags = await client.catalyst.v1.profileTags.by.user.id
        .get({ path: { id: accountUser.id }, throwOnError: true })
        .then((r) => r.data.tags)
        .catch(() => []);

      setInitialTags(tags);
      setUser(accountUser);
      return;
    }

    setUser(null);
    setInitialTags([]);

    try {
      const [userResult, relationships] = await Promise.all([
        client.egeria.v1.user.by.username.username.get({
          path: { username: screenName },
          throwOnError: true,
        }),
        client.catalyst.v1.relationships.id
          .get({ path: { id: screenName }, throwOnError: true })
          .then((r) => r.data)
          .catch(() => null),
      ]);

      if (userResult) {
        const userData = userResult.data.user;
        const tags = await client.catalyst.v1.profileTags.by.user.id
          .get({ path: { id: userData.id }, throwOnError: true })
          .then((r) => r.data.tags)
          .catch(() => []);

        setUser({ ...userData, profileEmoji: userData.profileEmoji ?? null });
        setInitialTags(tags);
      }

      if (relationships) {
        setRelationships(relationships);
      }
    } catch (e) {
      console.error(`failed to fetch user: @${screenName}, ${e}`);
    }
  }, [account, client, screenName]);

  const refreshProfile = useCallback(async () => {
    const [{ data }, refreshedRelationships] = await Promise.all([
      client.egeria.v1.user.by.username.username.get({
        path: { username: screenName },
        throwOnError: true,
      }),
      account?.user.screenName === screenName
        ? Promise.resolve(null)
        : client.catalyst.v1.relationships.id
            .get({ path: { id: screenName }, throwOnError: true })
            .then((result) => result.data)
            .catch(() => null),
    ]);
    const userData = data.user;
    const tags = await client.catalyst.v1.profileTags.by.user.id
      .get({ path: { id: userData.id }, throwOnError: true })
      .then((result) => result.data.tags)
      .catch(() => []);

    setUser({ ...userData, profileEmoji: userData.profileEmoji ?? null });
    setInitialTags(tags);
    if (refreshedRelationships) {
      setRelationships(refreshedRelationships);
    }
  }, [account, client, screenName]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const results = await Promise.allSettled([
        refreshProfile(),
        tabContentRef.current?.refresh?.() ?? Promise.resolve(),
      ]);
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failed) {
        console.error(`failed to refresh profile: @${screenName}, ${failed.reason}`);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshProfile, screenName]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      scrollY.setValue(contentOffset.y);

      const stickyVisible =
        headerHeight > 0 && contentOffset.y >= headerHeight - 103;
      setIsStickyTabBarInteractive((prev) =>
        prev === stickyVisible ? prev : stickyVisible,
      );

      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < LOAD_MORE_THRESHOLD) {
        tabContentRef.current?.loadMore();
      }
    },
    [scrollY, headerHeight],
  );

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-light-background dark:bg-dark-background">
        <ActivityIndicator size="large" colorClassName="accent-light-tint dark:accent-dark-tint" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-light-surface-muted dark:bg-dark-background">
      <ProfileBanner user={user} scrollY={scrollY} />

      <Animated.ScrollView
        ref={view}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        alwaysBounceVertical
        className="bg-transparent"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColorClassName="accent-transparent"
            colorsClassName="accent-transparent"
            progressBackgroundColorClassName="accent-transparent"
          />
        }
      >
        <ProfileHeader
          user={user}
          relationships={relationships}
          tags={initialTags}
          onUpdateRelationships={setRelationships}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        />

        <View
          className="flex-row border-b border-light-divider bg-light-background dark:border-dark-divider dark:bg-dark-surface"
          style={{
            width: screenWidth,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
        >
          <ProfileTabs
            activeIndex={activeTab}
            tabs={tabs}
            onClickTab={setActiveTab}
          />
        </View>

        <GestureDetector gesture={swipeGesture}>
          <View style={{ minHeight: 400 }}>
            <TabContent ref={tabContentRef} tab={tabs[activeTab]} user={user} />
          </View>
        </GestureDetector>
      </Animated.ScrollView>

      <ProfileOverlay
        user={user}
        relationships={relationships}
        scrollY={scrollY}
        showBackButton={showBackButton}
        onUpdateRelationships={setRelationships}
      />

      <Animated.View
        pointerEvents="none"
        className="absolute left-0 right-0 items-center"
        style={{
          top: insets.top + 8,
          opacity: isRefreshing ? 1 : pullIndicatorOpacity,
          transform: [{ scale: isRefreshing ? 1 : pullIndicatorScale }],
        }}
      >
        <View className="size-9 items-center justify-center rounded-full bg-black/60">
          <ActivityIndicator size="small" colorClassName="accent-white" />
        </View>
      </Animated.View>

      {/* Sticky Tab Bar Overlay */}
      <Animated.View
        className="flex-row border-b border-light-divider bg-light-background dark:border-dark-divider dark:bg-dark-surface"
        style={{
          position: "absolute",
          top: NAV_BAR_HEIGHT,
          left: 0,
          width: screenWidth,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          opacity: stickyTabBarOpacity,
        }}
        pointerEvents={isStickyTabBarInteractive ? "auto" : "none"}
      >
        <ProfileTabs
          activeIndex={activeTab}
          tabs={tabs}
          onClickTab={setActiveTab}
        />
      </Animated.View>
    </View>
  );
}
