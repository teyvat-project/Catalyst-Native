import { CatalystSearchField } from "@/components/design-system";
import { AlbumList } from "@/components/explorer/albums/list";
import { ContestList } from "@/components/explorer/contests/list";
import { ItemList } from "@/components/explorer/items/list";
import { StatusesEmptyResult } from "@/components/explorer/statuses/empty-result";
import { StatusesPlaceholder } from "@/components/explorer/statuses/placeholder";
import { TrendList } from "@/components/explorer/trends/list";
import { UserList } from "@/components/explorer/users/list";
import { UsersPlaceholder } from "@/components/explorer/users/placeholder";
import { Tab, Tabs } from "@/components/tabs";
import { WeeklyThemeList } from "@/components/theme/list";
import { TimelineBase, TimelineHandle } from "@/components/timeline/base";
import { clientAtom } from "@/models/atoms/credential";
import { useScrollToTop } from "expo-router/react-navigation";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { v4 } from "uuid";

// Web 版の検索と同じ並び
const TABS: Tab[] = [
  { key: "statuses", label: "投稿" },
  { key: "users", label: "ユーザー" },
  { key: "trends", label: "トレンド" },
  { key: "albums", label: "アルバム" },
  { key: "items", label: "アイテム" },
  { key: "contests", label: "コンテスト" },
  { key: "themes", label: "お題" },
];

const CURRENT_CONTEST_STATES = ["opening", "voting", "closing", "electing"];

export default function HomeScreen() {
  const [state, setState] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>(TABS[0].key);
  // ページャーは全タブを最初から描画するので、一度開いたタブだけ中身を出して、開くまで読み込みを始めない
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<string>>(() => new Set([TABS[0].key]));
  const client = useAtomValue(clientAtom);
  const insets = useSafeAreaInsets();
  const [stateKey, setStateKey] = useState(v4());
  const timelineRef = useRef<TimelineHandle>(null);
  const usersRef = useRef<TimelineHandle>(null);
  const trendsRef = useRef<TimelineHandle>(null);
  const albumsRef = useRef<TimelineHandle>(null);
  const itemsRef = useRef<TimelineHandle>(null);
  const contestsRef = useRef<TimelineHandle>(null);
  const themesRef = useRef<TimelineHandle>(null);

  const timeline = useCallback(
    async (since: string | null, until: string | null) => {
      if (!client) return [];

      const { data } = await client.catalyst.v1.timeline.search.get({
        query: {
          q: query,
          since: since ?? undefined,
          until: until ?? undefined,
        },
        throwOnError: true,
      });
      return data.statuses;
    },
    [client, query],
  );

  const runQuery = useCallback(() => {
    setQuery(state);
    setStateKey(v4());
  }, [state]);

  const scroller = useRef<{ scrollToTop: () => void }>(null);
  const scrollActiveTimelineToTopHandler = useMemo(() => {
    const refs: Record<string, React.RefObject<TimelineHandle | null>> = {
      statuses: timelineRef,
      users: usersRef,
      trends: trendsRef,
      albums: albumsRef,
      items: itemsRef,
      contests: contestsRef,
      themes: themesRef,
    };
    return { scrollToTop: () => refs[activeTab]?.current?.scrollToTop() };
  }, [activeTab]);

  useEffect(() => {
    scroller.current = scrollActiveTimelineToTopHandler;
  }, [scrollActiveTimelineToTopHandler]);

  useScrollToTop(scroller);

  return (
    <View className="flex-col flex-1 bg-light-background dark:bg-dark-background">
      {/* 検索欄はステータス表示 (iPhone Duo では右上) と重ならないよう、セーフエリアの左右を避ける */}
      <View className="pt-1" style={{ paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }}>
        <CatalystSearchField
          value={state}
          onChangeText={setState}
          onClear={() => setState("")}
          onSubmitEditing={runQuery}
          placeholder="検索"
          returnKeyType="search"
        />
      </View>
      <View className="flex-1">
        <Tabs
          tabs={TABS}
          scrollable
          onTabChange={(w) => {
            setActiveTab(w.key);
            setVisitedTabs((prev) => (prev.has(w.key) ? prev : new Set(prev).add(w.key)));
          }}
          renderScene={(w) => {
            if (!visitedTabs.has(w.key)) return null;

            switch (w.key) {
              case "statuses": {
                if (query) {
                  return (
                    <TimelineBase
                      ref={timelineRef}
                      key={stateKey}
                      fetcher={timeline}
                      ListEmptyComponent={StatusesEmptyResult}
                      ListEmptyComponentStyle={{ minHeight: "100%" }}
                    />
                  );
                }

                return <StatusesPlaceholder />;
              }

              case "users": {
                if (query) {
                  return <UserList ref={usersRef} query={query} />;
                }

                return <UsersPlaceholder />;
              }

              case "trends": {
                return <TrendList ref={trendsRef} />;
              }

              case "albums": {
                return <AlbumList ref={albumsRef} query={query} />;
              }

              case "items": {
                return <ItemList ref={itemsRef} query={query || undefined} />;
              }

              case "contests": {
                return (
                  <ContestList
                    ref={contestsRef}
                    key={stateKey}
                    states={CURRENT_CONTEST_STATES}
                    query={query || undefined}
                  />
                );
              }

              case "themes": {
                return <WeeklyThemeList ref={themesRef} query={query} />;
              }
            }
          }}
        />
      </View>
    </View>
  );
}
