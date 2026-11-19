import { CatalystEmptyState, CatalystText } from "@/components/design-system";
import { TimelineBase } from "@/components/timeline/base";
import { formatArchiveMonth, useArchiveMonths, type ArchiveMonth } from "@/hooks/use-archive-months";
import { clientAtom } from "@/models/atoms/credential";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniCalendarDaysIcon = withUniwind(CalendarDays);
const UniChevronLeftIcon = withUniwind(ChevronLeft);
const UniChevronRightIcon = withUniwind(ChevronRight);

type MonthLinkProps = {
  target: ArchiveMonth | undefined;
  current: { year: number; month: number };
  direction: "newer" | "older";
  onPress: (target: ArchiveMonth, direction: "newer" | "older") => void;
};

// 行き先の月を添えた前後移動のボタン。同じ年なら「11月」、年をまたぐときは「2025年12月」と出す
const MonthLink = ({ target, current, direction, onPress }: MonthLinkProps) => {
  // 行き先が無い側も幅を取っておき、見出しが中央からずれないようにする
  if (!target) return <View className="flex-1" />;

  const label = target.year === current.year ? `${target.month}月` : formatArchiveMonth(target);
  return (
    <View className={direction === "older" ? "flex-1 items-start" : "flex-1 items-end"}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${direction === "older" ? "古い月" : "新しい月"}: ${formatArchiveMonth(target)}`}
        onPress={() => onPress(target, direction)}
        className="h-8 flex-row items-center gap-0.5 rounded-lg px-2 active:opacity-60"
      >
        {direction === "older" ? <UniChevronLeftIcon size={18} className="text-light-tint dark:text-dark-tint" /> : null}
        <CatalystText variant="label" tone="tint">
          {label}
        </CatalystText>
        {direction === "newer" ? <UniChevronRightIcon size={18} className="text-light-tint dark:text-dark-tint" /> : null}
      </Pressable>
    </View>
  );
};

const ArchiveMonthEmpty = () => <CatalystEmptyState icon={<UniCalendarDaysIcon />} title="この月の投稿はありません" />;

export default function ArchiveMonthPage() {
  const params = useLocalSearchParams<{ year: string; month: string }>();
  const year = Number(params.year);
  const month = Number(params.month);
  const router = useRouter();
  const client = useAtomValue(clientAtom);
  const { months } = useArchiveMonths();

  // 前後の月は、投稿のある月だけをたどる (months は新しい順)。
  // この月が一覧に無くても (投稿の無い月へのリンクなど)、いちばん近い前後の月へ移れるようにする
  const order = (w: Pick<ArchiveMonth, "year" | "month">) => w.year * 12 + w.month;
  const current = order({ year, month });
  const newer = months.findLast((w) => order(w) > current);
  const older = months.find((w) => order(w) < current);
  const count = months.find((w) => order(w) === current)?.count;

  const fetcher = useCallback(
    async (since: string | null, until: string | null) => {
      if (!client || !year || !month) return [];

      const { data } = await client.catalyst.v1.timeline.archive.get({
        query: { year, month, since: since ?? undefined, until: until ?? undefined },
        throwOnError: true,
      });
      return data.statuses;
    },
    [client, year, month],
  );

  // 月を移るたびに画面を積むと戻るのが大変なので、置き換えて月の一覧へ 1 回で戻れるようにする
  // 移る向きを渡し、古い月へは戻るときと同じ向きの遷移にする (_layout.tsx の animationTypeForReplace)
  const moveTo = useCallback(
    (target: ArchiveMonth, direction: "newer" | "older") =>
      router.replace({
        pathname: "/archive/[year]/[month]",
        params: { year: target.year, month: target.month, direction },
      }),
    [router],
  );

  // カレンダーアプリと同じく、左を古い月、右を新しい月にする
  const ListHeaderComponent = useCallback(
    () => (
      <View className="flex-row items-center gap-2 border-b border-light-divider px-2 py-1 dark:border-dark-divider">
        <MonthLink target={older} current={{ year, month }} direction="older" onPress={moveTo} />
        {/* 前後のボタンと同じ高さ (h-8) を先に取っておき、月の一覧が届いて前後と件数が出ても見出しの高さを変えない */}
        <View className="min-h-8 flex-row items-center gap-1.5">
          <CatalystText variant="subtitle">{formatArchiveMonth({ year, month })}</CatalystText>
          {count !== undefined ? (
            <CatalystText variant="caption" tone="muted">
              {count}件
            </CatalystText>
          ) : null}
        </View>
        <MonthLink target={newer} current={{ year, month }} direction="newer" onPress={moveTo} />
      </View>
    ),
    [count, month, moveTo, newer, older, year],
  );

  return (
    <View className="flex-1 bg-light-background dark:bg-dark-background">
      <TimelineBase
        key={`${year}-${month}`}
        fetcher={fetcher}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ArchiveMonthEmpty}
        ListEmptyComponentStyle={{ minHeight: "80%" }}
      />
    </View>
  );
}
