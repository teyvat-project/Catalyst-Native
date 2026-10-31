import {
  CatalystBadge,
  CatalystBadgeText,
  CatalystMediaFrame,
  CatalystText,
} from "@/components/design-system";
import { getCdnUrl } from "@/lib/media";
import type { CatalystWeeklyTheme } from "@/models/sdk-types";
import dayjs from "dayjs";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);

type Props = {
  theme: CatalystWeeklyTheme;
};

const getPeriodText = (theme: CatalystWeeklyTheme) => {
  if (theme.state === "open") {
    const remainingDays = Math.max(0, dayjs(theme.until).diff(dayjs(), "day") + 1);
    return `あと${remainingDays}日・${theme.points}ポイント`;
  }
  return `${theme.statusCount}件の投稿・${theme.participantCount}人が参加`;
};

export const WeeklyThemeCard = ({ theme }: Props) => {
  const router = useRouter();

  return (
    <Pressable
      className="mx-3 py-3 active:opacity-80"
      accessibilityRole="button"
      onPress={() => router.push(`/theme/${theme.slug}` as never)}
    >
      <CatalystMediaFrame>
        <UniImage
          source={{ uri: getCdnUrl({ src: theme.bannerUrl ?? theme.generatedBannerUrl, variant: "header", width: 1500 }) }}
          className="aspect-[3/1] w-full"
          contentFit="cover"
        />
      </CatalystMediaFrame>

      <View className="gap-1.5 pt-2">
        <View className="flex-row items-center gap-2">
          <CatalystBadge tone={theme.state === "open" ? "success" : "neutral"} className="rounded-full">
            <CatalystBadgeText>{theme.state === "open" ? "開催中" : "終了"}</CatalystBadgeText>
          </CatalystBadge>
          {theme.sponsor ? (
            <CatalystBadge tone="warning" className="rounded-full">
              <CatalystBadgeText>{theme.sponsor.disclosure}</CatalystBadgeText>
            </CatalystBadge>
          ) : null}
        </View>
        <CatalystText variant="subtitle" numberOfLines={2}>
          {theme.title}
        </CatalystText>
        <CatalystText tone="muted" numberOfLines={2}>
          {theme.description}
        </CatalystText>
        <CatalystText variant="caption" tone="subtle">
          {getPeriodText(theme)}
        </CatalystText>
      </View>
    </Pressable>
  );
};
