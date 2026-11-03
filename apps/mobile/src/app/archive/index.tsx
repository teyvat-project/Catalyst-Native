import {
  CatalystButton,
  CatalystButtonText,
  CatalystEmptyState,
  CatalystListItem,
  CatalystSkeleton,
  CatalystText,
} from "@/components/design-system";
import { useArchiveMonths, type ArchiveMonth } from "@/hooks/use-archive-months";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { CalendarDays, ChevronRight } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { withUniwind } from "uniwind";

const UniCalendarDaysIcon = withUniwind(CalendarDays);
const UniChevronRightIcon = withUniwind(ChevronRight);

// 年の見出しと月の行を 1 本のリストに並べる
type Row = { type: "year"; year: number } | { type: "month"; month: ArchiveMonth };

const ArchiveMonthsPlaceholder = () => (
  <View accessibilityLabel="アーカイブを読み込み中" accessibilityRole="progressbar">
    {Array.from({ length: 6 }, (_, index) => (
      <View key={index} className="flex-row items-center gap-3 px-4 py-4">
        <CatalystSkeleton className="h-4 w-10 rounded-full" />
        <CatalystSkeleton className="h-2 flex-1 rounded-full" />
        <CatalystSkeleton className="h-4 w-12 rounded-full" />
      </View>
    ))}
  </View>
);

const ArchiveMonthsEmpty = () => <CatalystEmptyState icon={<UniCalendarDaysIcon />} title="アーカイブはまだありません" />;

const ArchiveMonthsError = ({ onReload }: { onReload: () => void }) => (
  <View className="h-full items-center justify-center gap-4 px-6">
    <CatalystEmptyState
      className="h-auto"
      icon={<UniCalendarDaysIcon />}
      title="アーカイブを読み込めませんでした"
      description="時間をおいてもう一度お試しください"
    />
    <CatalystButton tone="secondary" onPress={onReload}>
      <CatalystButtonText>再読み込み</CatalystButtonText>
    </CatalystButton>
  </View>
);

const ArchiveHeader = () => (
  <View className="px-4 pt-4 pb-2">
    <CatalystText tone="muted">過去の投稿を月別に振り返ることができます。</CatalystText>
  </View>
);

export default function ArchivePage() {
  const router = useRouter();
  const { months, isLoading, isError, reload } = useArchiveMonths();

  // months は新しい順なので、年が変わるところに見出しを差し込む
  const rows = useMemo(() => {
    const result: Row[] = [];
    let currentYear: number | null = null;
    for (const month of months) {
      if (month.year !== currentYear) {
        result.push({ type: "year", year: month.year });
        currentYear = month.year;
      }
      result.push({ type: "month", month });
    }
    return result;
  }, [months]);

  // 横棒の長さは、全期間でいちばん投稿の多い月を基準にする
  const maxCount = useMemo(() => Math.max(1, ...months.map((w) => w.count)), [months]);
  const stickyHeaderIndices = useMemo(
    () => rows.flatMap((row, index) => (row.type === "year" ? [index] : [])),
    [rows],
  );

  const renderItem = useCallback<ListRenderItem<Row>>(
    ({ item }) => {
      if (item.type === "year") {
        return (
          <View className="bg-light-background px-4 pt-4 pb-1 dark:bg-dark-background">
            <CatalystText variant="subtitle">{item.year}年</CatalystText>
          </View>
        );
      }

      const { year, month, count } = item.month;
      return (
        <CatalystListItem
          accessibilityLabel={`${year}年${month}月 ${count} 件の投稿`}
          onPress={() => router.push(`/archive/${year}/${month}`)}
          className="gap-3 px-4 py-3.5"
        >
          <CatalystText variant="label" className="w-10">
            {month}月
          </CatalystText>
          <View className="h-2 flex-1 overflow-hidden rounded-full bg-light-surface-muted dark:bg-dark-surface-muted">
            {/* 幅は件数で変わるので、ここだけ style で指定する */}
            <View
              className="h-full rounded-full bg-light-accent dark:bg-dark-accent"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </View>
          <CatalystText variant="caption" tone="muted" className="w-14 text-right">
            {count}件
          </CatalystText>
          <UniChevronRightIcon size={16} className="text-light-text-subtle dark:text-dark-text-subtle" />
        </CatalystListItem>
      );
    },
    [maxCount, router],
  );

  return (
    <View className="flex-1 bg-light-background dark:bg-dark-background">
      <FlashList
        data={rows}
        keyExtractor={(row) => (row.type === "year" ? `year-${row.year}` : `${row.month.year}-${row.month.month}`)}
        getItemType={(row) => row.type}
        renderItem={renderItem}
        stickyHeaderIndices={stickyHeaderIndices}
        ListHeaderComponent={ArchiveHeader}
        ListEmptyComponent={
          isLoading ? ArchiveMonthsPlaceholder : isError ? <ArchiveMonthsError onReload={reload} /> : ArchiveMonthsEmpty
        }
        ListEmptyComponentStyle={{ minHeight: "80%" }}
      />
    </View>
  );
}
