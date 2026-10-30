import { useDeviceLayout } from "@/lib/device-layout";
import { CatalystEmptyState, CatalystSkeleton } from "@/components/design-system";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { clientAtom } from "@/models/atoms/credential";
import type { CatalystWeeklyTheme } from "@/models/sdk-types";
import { FlashList, FlashListRef, type ListRenderItem } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { CalendarDays } from "lucide-react-native";
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { withUniwind } from "uniwind";
import { WeeklyThemeCard } from "./card";

const UniCalendarDays = withUniwind(CalendarDays);

type TimelineHandle = {
  scrollToTop: () => void;
};

type Props = {
  /** 省略すると開催中・過去のお題をまとめて出す (検索タブ用) */
  state?: "open" | "closed";
  /** 指定するとタイトルか説明に含むお題だけに絞り込む。API に検索が無いので Web 版と同じくアプリ側で絞り込む */
  query?: string;
  ref?: Ref<TimelineHandle>;
};

const ThemePlaceholder = () => (
  <View className="gap-4 px-3 py-3">
    {Array.from({ length: 3 }, (_, index) => (
      <View key={index} className="gap-2">
        <CatalystSkeleton className="h-32 w-full rounded-xl" />
        <CatalystSkeleton className="h-4 w-3/5 rounded-full" />
        <CatalystSkeleton className="h-3 w-full rounded-full" />
      </View>
    ))}
  </View>
);

// 検索中に続きを自動で読み込むとき、続けて失敗したらこの回数で止める。引っ張って更新すると数え直す
const MAX_AUTO_LOAD_FAILURES = 3;

const EMPTY_TEXTS = {
  open: { title: "開催中のお題はありません", description: "次のお題をお待ちください" },
  closed: { title: "過去のお題はありません", description: undefined },
  // Web 版の theme_detail.not_found と同じ文言
  all: { title: "お題が見つかりませんでした", description: undefined },
};

const EmptyState = ({ state }: Pick<Props, "state">) => (
  <CatalystEmptyState icon={<UniCalendarDays />} {...EMPTY_TEXTS[state ?? "all"]} />
);

export const WeeklyThemeList = ({ state, query, ref }: Props) => {
  const client = useAtomValue(clientAtom);
  const { listColumns } = useDeviceLayout();
  const [themes, setThemes] = useState<CatalystWeeklyTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadMoreFailures, setLoadMoreFailures] = useState(0);
  // 最初から読み直したら番号を進め、読み直す前に出した続きのリクエストが後から返ってきても結果を捨てる
  const requestId = useRef(0);
  const list = useRef<FlashListRef<CatalystWeeklyTheme>>(null);

  const fetchThemes = useCallback(
    async (cursor?: string | null) => {
      const weeklyThemes = client?.catalyst.v1.weeklyThemes;
      if (!weeklyThemes) {
        return { themes: [], nextCursor: null };
      }
      const { data } = await weeklyThemes.get({
        query: { state, take: 20, cursor: cursor ?? undefined },
        throwOnError: true,
      });

      return data;
    },
    [client, state],
  );

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const data = await fetchThemes();
    if (id !== requestId.current) return;
    setThemes(data.themes);
    setNextCursor(data.nextCursor);
  }, [fetchThemes]);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      await load();
    } finally {
      setLoading(false);
    }
  }, [load]);

  useImperativeHandle(
    ref,
    () => ({ scrollToTop: () => list.current?.scrollToOffset({ offset: 0, animated: true }) }),
    [],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadMoreFailures(0);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    const id = requestId.current;
    setIsLoadingMore(true);
    try {
      const data = await fetchThemes(nextCursor);
      if (id !== requestId.current) return;
      setThemes((previous) => [
        ...previous,
        ...data.themes.filter((theme) => !previous.some((item) => item.slug === theme.slug)),
      ]);
      setNextCursor(data.nextCursor);
      setLoadMoreFailures(0);
    } catch (e) {
      console.error(e);
      if (id === requestId.current) setLoadMoreFailures((n) => n + 1);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchThemes, isLoadingMore, nextCursor]);

  // 絞り込むときは古いお題も検索にかかるよう、続きをすべて読み込む (お題は週に 1 件なので数ページで終わる)。
  // 通信に失敗し続けると再試行が止まらなくなるので、決まった回数で諦める
  const isAutoLoading = !!query && !!nextCursor && loadMoreFailures < MAX_AUTO_LOAD_FAILURES;
  // 別のキーワードで探し直すときは、前のキーワードで失敗した回数を持ち越さない
  useEffect(() => {
    setLoadMoreFailures(0);
  }, [query]);
  useEffect(() => {
    if (isAutoLoading) {
      void onLoadMore();
    }
  }, [isAutoLoading, onLoadMore]);

  const visibleThemes = useMemo(() => {
    const keyword = query?.trim().toLowerCase();
    if (!keyword) return themes;
    return themes.filter(
      (theme) => theme.title.toLowerCase().includes(keyword) || theme.description.toLowerCase().includes(keyword),
    );
  }, [themes, query]);

  const renderItem = useCallback<ListRenderItem<CatalystWeeklyTheme>>(
    ({ item }) => <WeeklyThemeCard theme={item} />,
    [],
  );

  return (
    <FlashList
      numColumns={listColumns}
      ref={list}
      data={visibleThemes}
      keyExtractor={(item) => item.slug}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.75}
      // 続きを読み込んでいる途中は、まだ一致するお題が届いていないだけなので空の文言を出さない
      ListEmptyComponent={loading || isAutoLoading ? ThemePlaceholder : <EmptyState state={state} />}
      ListEmptyComponentStyle={{ minHeight: "80%" }}
      ListFooterComponent={isLoadingMore ? <ActivityIndicator className="py-4" /> : null}
      // 検索で絞り込むと表示中のお題が入れ替わる。既定のままだと前に見えていたお題を追って勝手にスクロールする
      maintainVisibleContentPosition={{ disabled: query !== undefined }}
    />
  );
};
