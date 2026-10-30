import {
  CatalystBadge,
  CatalystBadgeText,
  CatalystDivider,
  CatalystMediaFrame,
  CatalystText,
  type CatalystBadgeTone,
} from "@/components/design-system";
import { getCdnUrl } from "@/lib/media";
import type { CatalystContest } from "@/models/sdk-types";
import dayjs from "dayjs";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Trophy } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);
const UniTrophy = withUniwind(Trophy);

type Props = {
  contest: CatalystContest;
};

const STATE_LABEL: Record<string, string> = {
  opening: "作品受付中",
  voting: "投票受付中",
  closing: "投票準備中",
  electing: "結果準備中",
  published: "開催予定",
  closed: "終了",
};

const STATE_BADGE_TONE: Record<string, CatalystBadgeTone> = {
  opening: "success",
  voting: "info",
  closing: "warning",
  electing: "warning",
  published: "neutral",
  closed: "neutral",
};

const fmt = (d: string) => dayjs(d).format("YYYY/MM/DD");

const getPeriodText = (contest: CatalystContest): string => {
  switch (contest.state) {
    case "opening":
      return `受付終了: ${fmt(contest.until)}`;
    case "voting":
      return `投票終了: ${fmt(contest.voting.until)}`;
    case "closing":
    case "electing":
      return `結果発表予定: ${fmt(contest.winnersOpenAt)}`;
    case "published":
      return `開始予定: ${fmt(contest.since)}`;
    case "closed":
      return `終了: ${fmt(contest.winnersOpenAt)}`;
    default:
      return "";
  }
};

export const ContestCard = ({ contest }: Props) => {
  const router = useRouter();

  return (
    <Pressable
      className="mx-3 py-3 active:opacity-80"
      onPress={() => router.push(`/contest/${contest.slug}` as never)}
    >
      <CatalystMediaFrame>
        {contest.headerUrl ? (
          <UniImage
            source={{
              uri: getCdnUrl({
                src: contest.headerUrl,
                variant: "header",
                width: 1500,
              }),
            }}
            className="aspect-[3/1] w-full"
            contentFit="cover"
          />
        ) : (
          <View className="aspect-[3/1] w-full items-center justify-center bg-light-surface-muted dark:bg-dark-surface-muted">
            <UniTrophy
              size={40}
              className="text-light-icon dark:text-dark-icon"
            />
          </View>
        )}
      </CatalystMediaFrame>

      <View className="gap-1.5 pt-2">
        <CatalystBadge
          tone={STATE_BADGE_TONE[contest.state] ?? "neutral"}
          className="self-start rounded-full"
        >
          <CatalystBadgeText>
            {STATE_LABEL[contest.state] ?? contest.state}
          </CatalystBadgeText>
        </CatalystBadge>

        <CatalystText variant="subtitle" numberOfLines={2}>
          {contest.title}
        </CatalystText>

        {contest.theme && (
          <CatalystText tone="muted" numberOfLines={1}>
            テーマ: {contest.theme}
          </CatalystText>
        )}

        <CatalystText variant="caption" tone="subtle">
          {getPeriodText(contest)}
        </CatalystText>
      </View>

      <CatalystDivider className="mt-4" />
    </Pressable>
  );
};
