import {
  CatalystAvatar,
  CatalystBadge,
  CatalystBadgeText,
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystDivider,
  CatalystEmptyState,
  CatalystListItem,
  CatalystListItemContent,
  CatalystMediaFrame,
  CatalystSurface,
  CatalystText,
  type CatalystBadgeTone,
} from "@/components/design-system";
import { ContestDetailPlaceholder } from "@/components/explorer/contests/skeleton";
import { TimelineBase, type TimelineStatusItem } from "@/components/timeline/base";
import { TimelineStatus } from "@/components/timeline/status";
import { Markdown } from "@/components/ui/markdown";
import { useAsyncOneTimeEffect } from "@/hooks/use-async-one-time-effect";
import { abs } from "@/lib/dayjs";
import { useDeviceLayout } from "@/lib/device-layout";
import { getCdnUrl } from "@/lib/media";
import { clientAtom } from "@/models/atoms/credential";
import type { CatalystContest, CatalystStatus } from "@/models/sdk-types";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { ArrowLeft, FileQuestion, ThumbsUp, Trophy } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import "@/global.css";

const UniImage = withUniwind(Image);
const UniTrophy = withUniwind(Trophy);
const UniFileQuestion = withUniwind(FileQuestion);
const UniArrowLeft = withUniwind(ArrowLeft);
const UniThumbsUp = withUniwind(ThumbsUp);

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

const fmt = (d: string) => abs(d);

const InfoRow = ({
  label,
  noBorder,
  children,
}: {
  label: string;
  noBorder?: boolean;
  children: React.ReactNode;
}) => (
  <View className="py-3">
    <View className="flex-row">
      <CatalystText variant="label" className="w-28 shrink-0">
      {label}
      </CatalystText>
      <View className="flex-1">{children}</View>
    </View>
    {!noBorder ? <CatalystDivider className="mt-3" /> : null}
  </View>
);

const InfoText = ({ value }: { value: string }) => (
  <CatalystText>{value}</CatalystText>
);

type WinnerStatus = CatalystStatus & {
  message?: string | null;
  commentary?: string | null;
};

type CatalystContestAward = {
  id: string;
  name: string;
  winners: WinnerStatus[];
};

const AwardWinnerCard = ({ status }: { status: WinnerStatus }) => {
  const router = useRouter();
  const firstMedia = status.medias?.[0];
  const user = status.user;

  return (
    <CatalystListItem onPress={() => router.push(`/status/${status.id}` as never)}>
      <CatalystMediaFrame className="h-20 w-20 shrink-0 rounded-lg">
        {firstMedia ? (
          <UniImage
            source={{
              uri: getCdnUrl({
                src: firstMedia.url,
                variant: "thumbnail",
                width: 256,
              }),
            }}
            className="w-full h-full"
            contentFit="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <UniTrophy size={24} className="text-light-icon dark:text-dark-icon" />
          </View>
        )}
      </CatalystMediaFrame>

      <CatalystListItemContent>
        <View className="flex-row items-center gap-1.5">
          <CatalystAvatar
            alt={user?.displayName}
            fallback={user?.displayName}
            size="sm"
            source={user?.profile?.iconUrl ? getCdnUrl({ src: user.profile.iconUrl, variant: "icon", width: 64 }) : null}
          />
          <CatalystText variant="caption" className="font-semibold" numberOfLines={1}>
            {user?.displayName}
          </CatalystText>
          <CatalystText variant="caption" tone="muted" numberOfLines={1}>
            @{user?.screenName}
          </CatalystText>
        </View>

        {status.body?.length > 0 && (
          <CatalystText numberOfLines={3}>
            {status.body}
          </CatalystText>
        )}

        {status.commentary && (
          <View className="mt-1 pl-2 border-l-2 border-light-accent dark:border-dark-accent">
            <CatalystText variant="caption" tone="muted" numberOfLines={2}>
              {status.commentary}
            </CatalystText>
          </View>
        )}
      </CatalystListItemContent>
    </CatalystListItem>
  );
};

const AwardSection = ({ award }: { award: CatalystContestAward }) => (
  <View className="mb-2">
    <View className="flex-row items-center gap-2 px-4 py-3">
      <UniTrophy
        size={16}
        className="text-light-accent dark:text-dark-accent"
      />
      <CatalystText variant="subtitle" className="flex-1">
        {award.name}
      </CatalystText>
      <CatalystText variant="caption" tone="muted">
        {award.winners.length}作品
      </CatalystText>
    </View>

    {award.winners.length === 0 ? (
      <View className="px-4 py-3">
        <CatalystText tone="muted">
          受賞作品はありません
        </CatalystText>
      </View>
    ) : (
      (award.winners as unknown as WinnerStatus[]).map((winner) => (
        <AwardWinnerCard key={winner.id} status={winner} />
      ))
    )}
  </View>
);

type HeaderProps = {
  contest: CatalystContest;
  awards: CatalystContestAward[];
  voteRights?: VoteRights | null;
};

const ContestHeader = ({ contest, awards, voteRights }: HeaderProps) => {
  const { headerHeight } = useDeviceLayout();
  const terms = contest.terms
    ? contest.terms
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];

  // 画像は 1500:500 = 3:1。横長の画面で画面を占めすぎないよう高さを画面の 30% までにし、
  // そのときは上下が切れないよう 3:1 のまま中央に置く
  const imageHeight = headerHeight;

  return (
    <View className="bg-light-background dark:bg-dark-background">
      <View style={{ width: imageHeight * 3, height: imageHeight, alignSelf: "center" }}>
        {contest.headerUrl ? (
          <UniImage
            source={{
              uri: getCdnUrl({
                src: contest.headerUrl,
                variant: "header",
                width: 1500,
              }),
            }}
            style={{ width: "100%", height: imageHeight }}
            contentFit="cover"
          />
        ) : (
          <View
            className="w-full bg-neutral-200 dark:bg-neutral-800 items-center justify-center"
            style={{ height: imageHeight }}
          >
            <UniTrophy size={56} className="text-light-icon dark:text-dark-icon" />
          </View>
        )}
      </View>

      {/* タイトル・状態 */}
      <View className="px-4 pt-4 pb-2 gap-2">
        <CatalystBadge tone={STATE_BADGE_TONE[contest.state] ?? "neutral"} className="self-start">
          <CatalystBadgeText>
            {STATE_LABEL[contest.state] ?? contest.state}
          </CatalystBadgeText>
        </CatalystBadge>

        <CatalystText variant="title">
          {contest.title}
        </CatalystText>

        {contest.description?.length > 0 && (
          <Markdown body={contest.description} />
        )}
      </View>

      {/* 投票権バナー */}
      {contest.state === "voting" && contest.voting?.isEnable && voteRights && (
        <View className="mx-4 mb-2 px-4 py-2.5 bg-light-info-background dark:bg-dark-info-background rounded-xl flex-row items-center gap-2">
          <UniThumbsUp
            size={14}
            className="text-light-info dark:text-dark-info"
          />
          <CatalystText className="flex-1 text-light-info-foreground dark:text-dark-info-foreground">
            残り {voteRights.remaining} / {contest.voting.maxVotes}{" "}
            票を投票できます
          </CatalystText>
        </View>
      )}

      <CatalystSurface className="mx-4 mb-4 mt-2 px-4" radius="lg">
        <CatalystText variant="subtitle" className="pt-4 pb-2">
          応募要項
        </CatalystText>

        <InfoRow label="応募期間">
          <InfoText value={`${fmt(contest.since)} ～ ${fmt(contest.until)}`} />
        </InfoRow>

        {contest.theme?.length > 0 && (
          <InfoRow label="テーマ">
            <InfoText value={contest.theme} />
          </InfoRow>
        )}

        {contest.winnersOpenAt && (
          <InfoRow label="結果発表目安">
            <InfoText value={fmt(contest.winnersOpenAt)} />
          </InfoRow>
        )}

        <InfoRow label="審査方法">
          <View className="gap-1">
            <InfoText value="審査員選択" />
            {contest.voting?.isEnable && (
              <InfoText
                value={`ユーザー投票あり（1人${contest.voting.maxVotes}票まで）`}
              />
            )}
          </View>
        </InfoRow>

        {contest.voting?.isEnable && (
          <InfoRow label="投票期間">
            <InfoText
              value={`${fmt(contest.voting.since)} ～ ${fmt(contest.voting.until)}`}
            />
          </InfoRow>
        )}

        <InfoRow label="賞">
          {contest.ranks.length === 0 ? (
            <InfoText value="賞は設定されていません" />
          ) : (
            <View className="gap-3">
              {contest.ranks.map((rank) => (
                <View key={rank.id}>
                  <CatalystText variant="label">
                    {rank.name}
                  </CatalystText>
                  {rank.description && (
                    <CatalystText variant="caption" tone="muted" className="mt-0.5">
                      {rank.description}
                    </CatalystText>
                  )}
                  {rank.prize.length > 0 && (
                    <View>
                      <CatalystText variant="caption" tone="muted" className="mt-0.5">
                        賞品:
                      </CatalystText>
                      <CatalystText variant="caption" tone="muted" className="mt-0.5">
                        {rank.prize}
                      </CatalystText>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </InfoRow>

        <InfoRow label="応募規定" noBorder>
          <View className="gap-1">
            {terms.length ? (
              terms.map((term, i) => (
                <CatalystText
                  key={`${i}-${term}`}
                >
                  · {term}
                </CatalystText>
              ))
            ) : (
              <CatalystText>
                応募規定はありません
              </CatalystText>
            )}
          </View>
        </InfoRow>

        <View className="pb-4" />
      </CatalystSurface>

      {/* 受賞作品一覧（終了コンテストのみ） */}
      {contest.state === "closed" && awards.length > 0 && (
        <View className="mb-4">
          <View className="px-4 pb-2 border-b border-light-divider dark:border-dark-divider mb-2">
            <CatalystText variant="subtitle">
              受賞作品一覧
            </CatalystText>
          </View>
          {awards.map((award) => (
            <AwardSection key={award.id} award={award} />
          ))}
        </View>
      )}

      {/* タイムラインタイトル */}
      <View className="px-4 pb-2 border-b border-light-divider dark:border-dark-divider">
        <CatalystText variant="subtitle">
          投稿作品一覧
        </CatalystText>
      </View>
    </View>
  );
};

type VoteRights = {
  remaining: number;
  statuses: string[];
};

type VoteButtonProps = {
  statusId: string;
  voteRights: VoteRights;
  onVote: (id: string) => void;
  onUnvote: (id: string) => void;
};

const VoteButton = ({
  statusId,
  voteRights,
  onVote,
  onUnvote,
}: VoteButtonProps) => {
  const isVoted = voteRights.statuses.includes(statusId);
  const canVote = isVoted || voteRights.remaining > 0;

  return (
    <View className="px-4 pb-2 flex-row justify-end">
      <CatalystButton
        onPress={() => (isVoted ? onUnvote(statusId) : onVote(statusId))}
        disabled={!canVote}
        size="sm"
        tone={isVoted ? "secondary" : "ghost"}
        className={!canVote ? "opacity-40" : undefined}
      >
        <CatalystButtonIcon>
          <UniThumbsUp />
        </CatalystButtonIcon>
        <CatalystButtonText className="text-xs">
          {isVoted ? "投票済み" : "投票する"}
        </CatalystButtonText>
      </CatalystButton>
    </View>
  );
};

export default function ContestDetailPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const client = useAtomValue(clientAtom);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [contest, setContest] = useState<CatalystContest | null>(null);
  // TODO: SDK に getContestAwards と CatalystContestAward が再追加されたら、終了済みコンテストの受賞作品取得を復帰する。
  const [awards] = useState<CatalystContestAward[]>([]);
  const [isNotFound, setIsNotFound] = useState(false);
  const [voteRights, setVoteRights] = useState<VoteRights | null>(null);

  useAsyncOneTimeEffect(async () => {
    if (!client || !slug) return;
    try {
      const { data: contestData } = await client.catalyst.v1.contest.by.slug.slug.get({
        path: { slug },
        throwOnError: true,
      });
      const res = contestData.contest;
      setContest(res);

      if (res.state === "voting" && res.voting?.isEnable) {
        try {
          const { data: rights } = await client.catalyst.v1.contest.by.slug.slug.vote.get({
            path: { slug },
            throwOnError: true,
          });
          setVoteRights(rights);
        } catch {
          // 投票権情報の取得失敗はコンテスト表示自体には影響しない
        }
      }
    } catch {
      setIsNotFound(true);
    }
  });

  const handleVote = useCallback(
    async (statusId: string) => {
      if (!client || !slug) return;
      try {
        await client.catalyst.v1.contest.by.slug.slug.vote.status.create({
          path: { slug, status: statusId },
          throwOnError: true,
        });
        setVoteRights((prev) =>
          prev
            ? {
                remaining: prev.remaining - 1,
                statuses: [...prev.statuses, statusId],
              }
            : prev,
        );
      } catch {
        Alert.alert("エラー", "投票に失敗しました");
      }
    },
    [client, slug],
  );

  const handleUnvote = useCallback(
    async (statusId: string) => {
      if (!client || !slug) return;
      try {
        await client.catalyst.v1.contest.by.slug.slug.vote.status.delete({
          path: { slug, status: statusId },
          throwOnError: true,
        });
        setVoteRights((prev) =>
          prev
            ? {
                remaining: prev.remaining + 1,
                statuses: prev.statuses.filter((id) => id !== statusId),
              }
            : prev,
        );
      } catch {
        Alert.alert("エラー", "投票の取り消しに失敗しました");
      }
    },
    [client, slug],
  );

  const fetcher = useCallback(
    async (since: string | null, until: string | null) => {
      const result = await client?.catalyst.v1.timeline.contest.by.slug.slug.get({
        path: { slug },
        query: { since: since ?? undefined, until: until ?? undefined },
        throwOnError: true,
      });
      return result?.data.statuses ?? [];
    },
    [client, slug],
  );

  const renderItem = useCallback(
    ({ item }: { item: TimelineStatusItem }) => (
      <View>
        <TimelineStatus status={item} />
        {voteRights && (
          <VoteButton
            statusId={item.id}
            voteRights={voteRights}
            onVote={handleVote}
            onUnvote={handleUnvote}
          />
        )}
      </View>
    ),
    [voteRights, handleVote, handleUnvote],
  );

  const Header = useCallback(
    () =>
      contest ? (
        <ContestHeader
          contest={contest}
          awards={awards}
          voteRights={voteRights}
        />
      ) : null,
    [contest, awards, voteRights],
  );

  const renderContent = () => {
    if (isNotFound) {
      return (
        <CatalystEmptyState
          icon={<UniFileQuestion />}
          title="コンテストが見つかりません"
          description="削除されたか、アクセスできないコンテンツです"
        />
      );
    }

    if (!contest) {
      return <ContestDetailPlaceholder />;
    }

    return (
      <TimelineBase
        fetcher={fetcher}
        renderItem={voteRights ? renderItem : undefined}
        ListHeaderComponent={Header}
      />
    );
  };

  return (
    <View className="flex-1 bg-light-background dark:bg-dark-background">
      {renderContent()}

      {/* 戻るボタンオーバーレイ */}
      <View
        className="absolute left-0 right-0 top-0"
        style={{ paddingTop: insets.top }}
        pointerEvents="box-none"
      >
        <Pressable
          className="p-2 m-2 self-start"
          onPress={() => router.back()}
        >
          <View className="w-9 h-9 rounded-full bg-black/75 items-center justify-center">
            <UniArrowLeft size={18} className="text-white" />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
