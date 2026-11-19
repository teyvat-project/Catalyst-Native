import { CatalystAvatar, CatalystText } from "@/components/design-system";
import { EmojiPickerSheet, type EmojiPickerSheetRef } from "@/components/emoji-verse";
import { ReactionBar } from "@/components/reaction-bar";
import { StatusText } from "@/components/status/text";
import { StatusVisibilityBadge } from "@/components/status/visibility-badge";
import { MediaCarousel } from "@/components/ui/media-carousel";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { rel } from "@/lib/dayjs";
import { getCdnUrl } from "@/lib/media";
import { getCustomReactionId, getReactionKey } from "@/lib/reactions";
import { accountAtom } from "@/models/atoms/account";
import { reactionCacheAtomFamily } from "@/models/atoms/reactions";
import type { CatalystReaction, CatalystStatus, CatalystStatusPrivacy, CatalystStatusV1_1 } from "@/models/sdk-types";
import {
  applyReactionStreamingEvent,
  registerLocalReactionMutation,
  useStreamingReactions,
  type ReactionStreamingEvent,
} from "@/models/streaming";
import { useRouter } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import { Repeat2, Sparkles } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { withUniwind } from "uniwind";

export type StatusRenderingMode = "twtr" | "plain";

type StatusWithReactions = Omit<CatalystStatus, "reactions"> & {
  reactions?: Record<string, CatalystReaction>;
  visitor?: {
    favorite?: boolean;
    reactions?: string[];
  };
  privacy?: CatalystStatusPrivacy;
};

type Props = {
  status: CatalystStatus | CatalystStatusV1_1;
  renderingMode?: StatusRenderingMode;
};

type StatusWithRepost = {
  repost?: {
    id: string;
    createdAt: string;
  };
};

type StatusWithRecommendation = {
  isRecommended?: boolean;
};

const UniRepeat2 = withUniwind(Repeat2);
const UniSparkles = withUniwind(Sparkles);

export const TimelineStatus = memo(({ status, renderingMode = "twtr" }: Props) => {
  const router = useRouter();
  const account = useAtomValue(accountAtom);
  const { subscribe, unsubscribe } = useStreamingReactions();
  const emojiPickerRef = useRef<EmojiPickerSheetRef>(null);

  const user = status.user!;
  const medias = status.medias;
  const isLoggedIn = account !== null;
  const privacy = (status as StatusWithReactions).privacy;
  const repost = (status as StatusWithRepost).repost;
  const isRecommended = (status as StatusWithRecommendation).isRecommended === true;

  const [cachedReactions, setCachedReactions] = useAtom(reactionCacheAtomFamily(status.id));

  const baseReactions = useMemo(() => {
    const s = status as StatusWithReactions;
    const vr = s.visitor?.reactions ?? [];
    return Object.fromEntries(
      Object.entries(s.reactions ?? {}).map(([key, reaction]) => [
        key,
        {
          ...reaction,
          customReactionId: getCustomReactionId(key, reaction),
          hasSelfReaction: vr.includes(key),
        },
      ]),
    );
  }, [status]);

  const reactions = cachedReactions ?? baseReactions;

  const hasReactions = Object.values(reactions).some((r) => r.count >= 1);

  const handleStreamingReaction = useCallback(
    (event: ReactionStreamingEvent) => {
      setCachedReactions((prev) => applyReactionStreamingEvent(prev ?? baseReactions, event, `timeline:${status.id}`));
    },
    [baseReactions, setCachedReactions, status.id],
  );

  useEffect(() => {
    subscribe(status.id, handleStreamingReaction);
    return () => {
      unsubscribe(status.id, handleStreamingReaction);
    };
  }, [handleStreamingReaction, status.id, subscribe, unsubscribe]);

  const navigateToStatus = () => router.push(`/status/${status.id}`);
  const navigateToUser = () => user && router.push(`/user/${user.screenName}`);

  const handleReact = useCallback(
    async (symbol: string, url?: string, customReactionId?: string) => {
      if (!account?.credential.client) return;
      const snapshot = cachedReactions ?? baseReactions;
      const key = getReactionKey(symbol, customReactionId);
      const updated = {
        ...snapshot,
        [key]: {
          ...snapshot[key],
          symbol,
          url: url ?? snapshot[key]?.url,
          customReactionId: customReactionId ?? snapshot[key]?.customReactionId,
          count: (snapshot[key]?.count ?? 0) + 1,
          hasSelfReaction: true,
        },
      };
      setCachedReactions(updated);
      const rollbackLocalMutation = registerLocalReactionMutation(
        status.id,
        "reaction:increment",
        symbol,
        customReactionId,
      );
      try {
        if (customReactionId) {
          await account.credential.client.catalyst.v1.status.id.reactions.custom.customReactionId.create({
            path: { id: status.id, customReactionId },
            throwOnError: true,
          });
        } else {
          await account.credential.client.catalyst.v1.status.id.reactions.symbol.create({
            path: { id: status.id, symbol },
            throwOnError: true,
          });
        }
      } catch {
        rollbackLocalMutation();
        setCachedReactions(snapshot);
        Alert.alert("エラー", "リアクションに失敗しました");
      }
    },
    [account, status.id, cachedReactions, baseReactions, setCachedReactions],
  );

  const handleUnreact = useCallback(
    async (symbol: string, customReactionId?: string) => {
      if (!account?.credential.client) return;
      const snapshot = cachedReactions ?? baseReactions;
      const key = getReactionKey(symbol, customReactionId);
      const updated = {
        ...snapshot,
        [key]: {
          ...snapshot[key],
          count: Math.max(0, (snapshot[key]?.count ?? 0) - 1),
          hasSelfReaction: false,
        },
      };
      setCachedReactions(updated);
      const rollbackLocalMutation = registerLocalReactionMutation(
        status.id,
        "reaction:decrement",
        symbol,
        customReactionId,
      );
      try {
        if (customReactionId) {
          await account.credential.client.catalyst.v1.status.id.reactions.custom.customReactionId.delete({
            path: { id: status.id, customReactionId },
            throwOnError: true,
          });
        } else {
          await account.credential.client.catalyst.v1.status.id.reactions.symbol.delete({
            path: { id: status.id, symbol },
            throwOnError: true,
          });
        }
      } catch {
        rollbackLocalMutation();
        setCachedReactions(snapshot);
        Alert.alert("エラー", "リアクションの取り消しに失敗しました");
      }
    },
    [account, status.id, cachedReactions, baseReactions, setCachedReactions],
  );

  return (
    <View className="bg-light-background pt-3 dark:bg-dark-background">
      {isRecommended ? (
        <View className="mb-1 flex-row items-center gap-1 px-4">
          <UniSparkles size={14} className="text-light-tint dark:text-dark-tint" />
          <CatalystText variant="caption" tone="muted" numberOfLines={1}>
            おすすめ
          </CatalystText>
        </View>
      ) : null}

      {repost ? (
        <View className="mb-1 flex-row items-center gap-1 px-4">
          <UniRepeat2 size={14} className="text-light-tint dark:text-dark-tint" />
          <CatalystText variant="caption" tone="muted" numberOfLines={1}>
            {user.displayName}さんがリポストしました
          </CatalystText>
        </View>
      ) : null}

      <View className="flex-row items-center gap-3 px-4">
        <Pressable accessibilityRole="button" className="active:opacity-75" onPress={navigateToUser}>
          <CatalystAvatar
            source={
              user?.profile?.iconUrl
                ? getCdnUrl({
                    src: user.profile.iconUrl,
                    variant: "icon",
                    width: 80,
                  })
                : null
            }
            fallback={user.displayName}
            size="md"
          />
        </Pressable>

        <Pressable accessibilityRole="button" className="min-w-0 flex-1 active:opacity-90" onPress={navigateToStatus}>
          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              className="min-w-0 flex-row items-center gap-1 active:opacity-75"
              onPress={navigateToUser}
            >
              <CatalystText variant="label" className="min-w-0 shrink" numberOfLines={1}>
                {user.displayName}
              </CatalystText>
              <ProfileEmoji emoji={user.profileEmoji} size={14} />
            </Pressable>
          </View>

          <View className="mt-0.5 flex-row items-center">
            <CatalystText variant="caption" tone="muted" numberOfLines={1}>
              @{user.screenName}
            </CatalystText>
            <CatalystText variant="caption" tone="muted">
              {" · "}
              {rel(status.createdAt)}
            </CatalystText>
          </View>
        </Pressable>

        <StatusVisibilityBadge className="ml-2 self-center" privacy={privacy} />
      </View>

      {medias.length > 0 ? (
        <View className="mt-3">
          <MediaCarousel key={status.id} medias={medias} createdAt={status.createdAt} />
        </View>
      ) : null}

      {status.body.length > 0 ? (
        <Pressable accessibilityRole="button" className="px-4 pt-3 active:opacity-90" onPress={navigateToStatus}>
          {renderingMode === "twtr" ? (
            <StatusText status={status.body} />
          ) : (
            <Text className="text-[15px] leading-5 text-light-text dark:text-dark-text">{status.body}</Text>
          )}
        </Pressable>
      ) : null}

      {hasReactions || isLoggedIn ? (
        <Pressable accessibilityRole="button" className="px-4 pt-2 active:opacity-90" onPress={navigateToStatus}>
          <ReactionBar
            reactions={reactions}
            onReact={handleReact}
            onUnreact={handleUnreact}
            onAddReaction={isLoggedIn ? () => emojiPickerRef.current?.open() : undefined}
          />
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" className="h-3" onPress={navigateToStatus} />

      <EmojiPickerSheet ref={emojiPickerRef} onReact={handleReact} searchContextId={status.id} />
    </View>
  );
});
TimelineStatus.displayName = "TimelineStatus";
