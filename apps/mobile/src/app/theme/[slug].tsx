import {
  CatalystBadge,
  CatalystBadgeText,
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystEmptyState,
  CatalystMediaFrame,
  CatalystText,
} from "@/components/design-system";
import { TimelineBase, type TimelineStatusItem } from "@/components/timeline/base";
import { Markdown } from "@/components/ui/markdown";
import { useAsyncOneTimeEffect } from "@/hooks/use-async-one-time-effect";
import { abs } from "@/lib/dayjs";
import { useDeviceLayout } from "@/lib/device-layout";
import { getCdnUrl } from "@/lib/media";
import { clientAtom, credentialAtom } from "@/models/atoms/credential";
import { openUrlWithBrowser } from "@/models/browser-settings";
import type { CatalystWeeklyTheme } from "@/models/sdk-types";
import { Image } from "expo-image";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { CalendarDays, Camera, ExternalLink, FileQuestion, Users } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);
const UniCalendarDays = withUniwind(CalendarDays);
const UniCamera = withUniwind(Camera);
const UniExternalLink = withUniwind(ExternalLink);
const UniFileQuestion = withUniwind(FileQuestion);
const UniUsers = withUniwind(Users);
const UniLink = withUniwind(Link);

const ThemeHeader = ({ theme }: { theme: CatalystWeeklyTheme }) => {
  const credential = useAtomValue(credentialAtom);
  const { headerHeight } = useDeviceLayout();
  const router = useRouter();
  const canCompose = theme.state === "open" && !!credential.accessToken;

  return (
    <View className="gap-4 bg-light-background pb-5 dark:bg-dark-background">
      <CatalystMediaFrame>
        <UniImage
          source={{ uri: getCdnUrl({ src: theme.bannerUrl ?? theme.generatedBannerUrl, variant: "header", width: 1500 }) }}
          className="w-full"
          // お題のバナーは 1200:400 = 3:1。横長の画面で画面を占めすぎないよう、高さは画面の 30% までにする
          style={{ height: headerHeight }}
          contentFit="cover"
        />
      </CatalystMediaFrame>

      <View className="gap-3 px-4">
        <View className="flex-row items-center gap-2">
          <CatalystBadge tone={theme.state === "open" ? "success" : "neutral"}>
            <CatalystBadgeText>{theme.state === "open" ? "開催中" : "終了"}</CatalystBadgeText>
          </CatalystBadge>
          {theme.sponsor ? (
            <CatalystBadge tone="warning">
              <CatalystBadgeText>{theme.sponsor.disclosure}</CatalystBadgeText>
            </CatalystBadge>
          ) : null}
        </View>
        <CatalystText variant="title">{theme.title}</CatalystText>
        <Markdown body={theme.description} />
        {theme.hashtag ? (
          <CatalystText>
            推奨ハッシュタグ:{" "}
            <UniLink href={`/search/%23${encodeURIComponent(theme.hashtag)}`} className="text-light-link dark:text-dark-link">
              #{theme.hashtag}
            </UniLink>
          </CatalystText>
        ) : null}
        <View className="flex-row flex-wrap gap-x-4 gap-y-2">
          <View className="flex-row items-center gap-1.5">
            <UniCalendarDays size={15} className="text-light-text-muted dark:text-dark-text-muted" />
            <CatalystText variant="caption" tone="muted">{abs(theme.until)} まで</CatalystText>
          </View>
          <View className="flex-row items-center gap-1.5">
            <UniUsers size={15} className="text-light-text-muted dark:text-dark-text-muted" />
            <CatalystText variant="caption" tone="muted">{theme.participantCount}人が参加</CatalystText>
          </View>
        </View>
        {theme.sponsor ? (
          <Pressable
            accessibilityRole={theme.sponsor.url ? "link" : "text"}
            disabled={!theme.sponsor.url}
            className="flex-row items-center gap-2 self-start active:opacity-70"
            onPress={() => theme.sponsor?.url && openUrlWithBrowser(theme.sponsor.url)}
          >
            {theme.sponsor.logoUrl ? (
              <UniImage source={{ uri: theme.sponsor.logoUrl }} className="size-6 rounded" contentFit="contain" />
            ) : null}
            <CatalystText variant="caption" tone="muted">提供: {theme.sponsor.name}</CatalystText>
            {theme.sponsor.url ? <UniExternalLink size={13} className="text-light-text-muted dark:text-dark-text-muted" /> : null}
          </Pressable>
        ) : null}
        {canCompose ? (
          <CatalystButton onPress={() => router.push(`/compose/post?theme=${encodeURIComponent(theme.slug)}` as never)}>
            <CatalystButtonIcon><UniCamera /></CatalystButtonIcon>
            <CatalystButtonText>{theme.visitor?.submitted ? "もう一度投稿する" : `このお題で投稿する（${theme.points}ポイント）`}</CatalystButtonText>
          </CatalystButton>
        ) : null}
      </View>
    </View>
  );
};

export default function ThemeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const client = useAtomValue(clientAtom);
  const [theme, setTheme] = useState<CatalystWeeklyTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useAsyncOneTimeEffect(async () => {
    const weeklyThemes = client?.catalyst.v1.weeklyThemes;
    if (!weeklyThemes || !slug) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await weeklyThemes.by.slug.slug.get({
        path: { slug },
        throwOnError: true,
      });
      setTheme(data.theme);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  });

  const fetchStatuses = useCallback(
    async (_since: string | null, until: string | null): Promise<TimelineStatusItem[]> => {
      const weeklyThemes = client?.catalyst.v1.weeklyThemes;
      if (!weeklyThemes || !slug) return [];
      const { data } = await weeklyThemes.by.slug.slug.statuses.get({
        path: { slug },
        query: { cursor: until ?? undefined, sort: "latest" },
        throwOnError: true,
      });
      return data.statuses;
    },
    [client, slug],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-light-background dark:bg-dark-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !theme) {
    return (
      <CatalystEmptyState
        icon={<UniFileQuestion />}
        title="お題が見つかりません"
        description="公開終了または削除された可能性があります"
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "お題", headerBackTitle: "戻る" }} />
      <TimelineBase
        fetcher={fetchStatuses}
        ListHeaderComponent={() => <ThemeHeader theme={theme} />}
        ListEmptyComponent={() => (
          <CatalystEmptyState
            icon={<UniCamera />}
            title="まだ投稿はありません"
            description="最初の一枚を投稿してみましょう"
          />
        )}
        ListEmptyComponentStyle={{ minHeight: 320 }}
      />
    </>
  );
}
