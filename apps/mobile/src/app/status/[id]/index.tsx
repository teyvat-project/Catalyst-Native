import { AlbumSelectionModal } from "@/components/album/selection-modal";
import {
  CatalystActionSheetItem,
  CatalystAvatar,
  CatalystBadge,
  CatalystBadgeText,
  CatalystDivider,
  CatalystEmptyState,
  CatalystIconButton,
  CatalystText,
  catalystLinkClassName,
} from "@/components/design-system";
import { EmojiPickerSheet, type EmojiPickerSheetRef } from "@/components/emoji-verse";
import { ReactionBar } from "@/components/reaction-bar";
import { ActionBar } from "@/components/status/action-bar";
import { StatusText } from "@/components/status/text";
import { StatusVisibilityBadge } from "@/components/status/visibility-badge";
import { StatusDetailPlaceholder } from "@/components/timeline/placeholder";
import { MediaCarousel } from "@/components/ui/media-carousel";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { abs, rel } from "@/lib/dayjs";
import { getCdnUrl } from "@/lib/media";
import { getReactionKey } from "@/lib/reactions";
import { quoteSearchQualifier } from "@/lib/search-query";
import { cn } from "@/lib/utils";
import { accountAtom } from "@/models/atoms/account";
import { clientAtom } from "@/models/atoms/credential";
import { metadataRevisionAtomFamily } from "@/models/atoms/epiclese-metadata";
import { openUrlWithBrowser } from "@/models/browser-settings";
import {
  EPICLESE_ITEM_TYPE_LABELS,
  getEpicleseWorld,
  type EpicleseMetadata,
  type EpicleseReference,
} from "@/models/epiclese";
import type { CatalystContest, CatalystReaction, CatalystStatusV1_1, CatalystWeeklyTheme } from "@/models/sdk-types";
import {
  applyReactionStreamingEvent,
  registerLocalReactionMutation,
  useStreamingReactions,
  type ReactionStreamingEvent,
} from "@/models/streaming";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import {
  ArrowLeft,
  Bookmark,
  BookmarkMinus,
  Check,
  Clipboard as ClipboardIcon,
  ExternalLink,
  FileQuestion,
  Flag,
  Globe,
  MoreHorizontal,
  Pencil,
  Send,
  Tags,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { ContestBanner } from "@/components/contest/banner";
import { WeeklyThemeBanner } from "@/components/theme/banner";
import "@/global.css";
import { buildShareText, buildWorldShareText, withShareUtm } from "@/lib/share";
import { fetchVRChatWorldAuthorName, isVRChatWorldId } from "@/lib/vrchat-world";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";

type MenuAction =
  | "addToAlbum"
  | "removeFromAlbum"
  | "edit"
  | "editMetadata"
  | "delete"
  | "report"
  | "openInBrowser"
  | "copyUrl"
  | "copyPost"
  | "share"
  | "shareWithWorld";

const UniArrowLeft = withUniwind(ArrowLeft);
const UniBookmark = withUniwind(Bookmark);
const UniBookmarkMinus = withUniwind(BookmarkMinus);
const UniCheck = withUniwind(Check);
const UniClipboardIcon = withUniwind(ClipboardIcon);
const UniExternalLink = withUniwind(ExternalLink);
const UniFileQuestion = withUniwind(FileQuestion);
const UniFlag = withUniwind(Flag);
const UniMoreHorizontal = withUniwind(MoreHorizontal);
const UniPencil = withUniwind(Pencil);
const UniSafeAreaView = withUniwind(SafeAreaView);
const UniSend = withUniwind(Send);
const UniTags = withUniwind(Tags);
const UniGlobe = withUniwind(Globe);
const UniTrash2 = withUniwind(Trash2);

// ワールド付き共有で、作成者の取得を待つ時間。これを過ぎたら作成者なしで共有する
const WORLD_AUTHOR_TIMEOUT_MS = 10_000;

// レスポンスの status.contest は SDK 上 unknown 型のため、参加先コンテストを特定できる slug の有無だけを安全に確認する
const getContestSlug = (contest: unknown): string | null => {
  if (typeof contest === "string") return contest.length > 0 ? contest : null;
  if (contest && typeof contest === "object" && "slug" in contest) {
    const slug = (contest as { slug?: unknown }).slug;
    return typeof slug === "string" && slug.length > 0 ? slug : null;
  }
  return null;
};

const getWeeklyTheme = (weeklyTheme: unknown): Pick<CatalystWeeklyTheme, "slug" | "title" | "weekKey" | "sponsor"> | null => {
  if (!weeklyTheme || typeof weeklyTheme !== "object") return null;
  const candidate = weeklyTheme as { slug?: unknown; title?: unknown; weekKey?: unknown; sponsor?: unknown };
  if (typeof candidate.slug !== "string" || typeof candidate.title !== "string" || typeof candidate.weekKey !== "string") {
    return null;
  }
  return {
    slug: candidate.slug,
    title: candidate.title,
    weekKey: candidate.weekKey,
    sponsor: candidate.sponsor as CatalystWeeklyTheme["sponsor"],
  };
};

const METADATA_LABELS: Record<string, string> = {
  Author: "撮影者",
  LocationName: "撮影場所",
  TakenBy: "撮影者",
  TakenAt: "撮影日時",
  Platform: "撮影プラットフォーム",
  World: "撮影ワールド",
};

export default function StatusDetailsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const account = useAtomValue(accountAtom);
  const client = useAtomValue(clientAtom);
  const metadataRevision = useAtomValue(metadataRevisionAtomFamily(id));
  const { subscribe, unsubscribe } = useStreamingReactions();

  const [status, setStatus] = useState<CatalystStatusV1_1 | null>(null);
  const [contest, setContest] = useState<Pick<CatalystContest, "slug" | "title" | "headerUrl"> | null>(null);
  const [weeklyTheme, setWeeklyTheme] = useState<Pick<CatalystWeeklyTheme, "slug" | "title" | "weekKey" | "sponsor"> | null>(null);
  const [metadata, setMetadata] = useState<EpicleseMetadata>({});
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [reactions, setReactions] = useState<Record<string, CatalystReaction>>({});
  const [editingCaption, setEditingCaption] = useState("");
  const [isEditSheetVisible, setIsEditSheetVisible] = useState(false);
  const [isAlbumSelectionVisible, setIsAlbumSelectionVisible] = useState(false);
  const [albumSelectionMode, setAlbumSelectionMode] = useState<"add" | "remove">("add");
  const [isEditingSaving, setIsEditingSaving] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const emojiPickerRef = useRef<EmojiPickerSheetRef>(null);
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const theme = useColorScheme() ?? "light";
  const insets = useSafeAreaInsets();

  const mediaPins = useMemo(() => {
    const pins: Record<string, EpicleseReference[]> = {};
    for (const [mediaId, meta] of Object.entries(metadata)) {
      if (meta.reference.length > 0) pins[mediaId] = meta.reference;
    }
    return pins;
  }, [metadata]);

  // 共有テキストに載せるワールド。X などのカードには 1 枚目の写真が出るので、1 枚目のワールドを代表にする。
  // ワールド名が無ければ (非公開ワールドは ID だけで名前が無い) ワールド付き共有は出さない。ID が無くても名前だけで共有する
  const firstWorld = useMemo(() => {
    const worlds = (status?.medias ?? []).map((media) => metadata[media.id] && getEpicleseWorld(metadata[media.id]));
    const [world] = worlds;
    if (!world) return null;

    // 2 枚目以降にある、1 枚目とは別のワールドを数える。ID が無い写真もあるので、読む人が目にするワールド名で見分ける
    const others = new Set(worlds.slice(1).flatMap((other) => (other ? [other.name] : [])));
    others.delete(world.name);
    return { ...world, otherWorldCount: others.size };
  }, [status, metadata]);

  const isMyself = account?.user?.id === status?.user?.id;
  const isLoggedIn = account !== null;
  const privacy = status?.privacy;
  const statusUrl = `https://catalyst.natsuneko.com/status/${id}`;

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const [statusRes, metadataRes, reactionsRes] = await Promise.all([
          client.catalyst.v11.status.id.get({ path: { id }, throwOnError: true }).then(({ data }) => data.status),
          fetch(`https://api.natsuneko.com/epiclese/v1/tag/by/status/${id}`)
            .then((r) => r.json() as Promise<EpicleseMetadata>)
            .catch(() => ({})),
          client.catalyst.v1.status.id.reactions
            .get({ path: { id }, throwOnError: true })
            .then(({ data }) => data.reactions)
            .catch(() => ({})),
        ]);
        setStatus(statusRes);
        setMetadata(metadataRes ?? {});
        setReactions(reactionsRes);

        const contestSlug = getContestSlug(statusRes.contest);
        if (contestSlug) {
          setContest(statusRes.contest as Pick<CatalystContest, "slug" | "title" | "headerUrl">);
        } else {
          setContest(null);
        }
        setWeeklyTheme(getWeeklyTheme(statusRes.weeklyTheme));

        if (account?.credential.client) {
          const [favRes, repostRes] = await Promise.all([
            account.credential.client.catalyst.v1.status.id.favorite
              .get({ path: { id }, throwOnError: true })
              .then(({ data }) => data)
              .catch(() => false),
            account.credential.client.catalyst.v1.status.id.repost
              .get({ path: { id }, throwOnError: true })
              .then(({ data }) => data)
              .catch(() => false),
          ]);
          setIsFavorited(favRes as boolean);
          setIsReposted(repostRes as boolean);
        }
      } catch {
        setIsNotFound(true);
      }
    };

    fetchData();
  }, [id, account, client, metadataRevision]);

  const handleStreamingReaction = useCallback(
    (event: ReactionStreamingEvent) => {
      setReactions((prev) => applyReactionStreamingEvent(prev, event, `status-detail:${id}`));
    },
    [id],
  );

  useEffect(() => {
    if (!id) return;

    subscribe(id, handleStreamingReaction);
    return () => {
      unsubscribe(id, handleStreamingReaction);
    };
  }, [handleStreamingReaction, id, subscribe, unsubscribe]);

  const handleReact = useCallback(
    async (symbol: string, url?: string, customReactionId?: string) => {
      if (!account?.credential.client || !id) return;
      const snapshot = reactions;
      const key = getReactionKey(symbol, customReactionId);
      setReactions((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          symbol,
          url: url ?? prev[key]?.url,
          customReactionId: customReactionId ?? prev[key]?.customReactionId,
          count: (prev[key]?.count ?? 0) + 1,
          hasSelfReaction: true,
        },
      }));
      const rollbackLocalMutation = registerLocalReactionMutation(id, "reaction:increment", symbol, customReactionId);
      try {
        if (customReactionId) {
          await account.credential.client.catalyst.v1.status.id.reactions.custom.customReactionId.create({
            path: { id, customReactionId },
            throwOnError: true,
          });
        } else {
          await account.credential.client.catalyst.v1.status.id.reactions.symbol.create({
            path: { id, symbol },
            throwOnError: true,
          });
        }
      } catch {
        rollbackLocalMutation();
        setReactions(snapshot);
        Alert.alert("エラー", "リアクションに失敗しました");
      }
    },
    [account, id, reactions],
  );

  const handleUnreact = useCallback(
    async (symbol: string, customReactionId?: string) => {
      if (!account?.credential.client || !id) return;
      const snapshot = reactions;
      const key = getReactionKey(symbol, customReactionId);
      setReactions((prev) => ({
        ...prev,
        [key]: { ...prev[key], count: Math.max(0, (prev[key]?.count ?? 0) - 1), hasSelfReaction: false },
      }));
      const rollbackLocalMutation = registerLocalReactionMutation(id, "reaction:decrement", symbol, customReactionId);
      try {
        if (customReactionId) {
          await account.credential.client.catalyst.v1.status.id.reactions.custom.customReactionId.delete({
            path: { id, customReactionId },
            throwOnError: true,
          });
        } else {
          await account.credential.client.catalyst.v1.status.id.reactions.symbol.delete({
            path: { id, symbol },
            throwOnError: true,
          });
        }
      } catch {
        rollbackLocalMutation();
        setReactions(snapshot);
        Alert.alert("エラー", "リアクションの取り消しに失敗しました");
      }
    },
    [account, id, reactions],
  );

  const handleDeleteStatus = useCallback(async () => {
    if (!account?.credential.client || !id) return;
    try {
      await account.credential.client.catalyst.v1.status.id.delete({ path: { id }, throwOnError: true });
      router.back();
    } catch {
      Alert.alert("エラー", "削除に失敗しました");
    }
  }, [account, id, router]);

  const handleEditSave = useCallback(async () => {
    if (!account?.credential.client || !id || !editingCaption) return;
    setIsEditingSaving(true);
    try {
      await account.credential.client.catalyst.v1.status.id.patch({
        path: { id },
        body: { description: editingCaption },
        throwOnError: true,
      });
      setStatus((prev) => (prev ? { ...prev, body: editingCaption } : prev));
      setIsEditSheetVisible(false);
    } catch {
      Alert.alert("エラー", "更新に失敗しました");
    } finally {
      setIsEditingSaving(false);
    }
  }, [account, id, editingCaption]);

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      switch (action) {
        case "addToAlbum":
          setAlbumSelectionMode("add");
          setIsAlbumSelectionVisible(true);
          break;
        case "removeFromAlbum":
          setAlbumSelectionMode("remove");
          setIsAlbumSelectionVisible(true);
          break;
        case "edit":
          setEditingCaption(status?.body ?? "");
          setIsEditSheetVisible(true);
          break;
        case "editMetadata":
          router.push(`/status/${id}/metadata`);
          break;
        case "delete":
          Alert.alert("この投稿を削除しますか？", "この操作は取り消せません", [
            { text: "キャンセル", style: "cancel" },
            { text: "削除", style: "destructive", onPress: handleDeleteStatus },
          ]);
          break;
        case "report":
          router.push(`/report/${id}`);
          break;
        case "openInBrowser":
          openUrlWithBrowser(statusUrl);
          break;
        case "copyUrl":
          Clipboard.setStringAsync(withShareUtm(statusUrl, "status", "copy"));
          break;
        case "copyPost":
          Clipboard.setStringAsync(
            buildShareText(
              status?.body ?? "",
              status?.user?.displayName ?? "",
              withShareUtm(statusUrl, "status", "copy"),
            ),
          );
          break;
        case "share":
          // iOS でも URL を別枠 (url) で渡さず本文に含める。別枠にすると多くの共有先が URL だけを受け取り、本文が落ちる
          Share.share({
            message: buildShareText(
              status?.body ?? "",
              status?.user?.displayName ?? "",
              withShareUtm(statusUrl, "status", "share_sheet"),
            ),
          });
          break;
      }
    },
    [status, statusUrl, handleDeleteStatus, id, router],
  );

  // ワールド付き共有で作成者を取っている途中のリクエスト。取り終えるまではメニューを開いたままにし、
  // 項目を「取得中」にして二度押しを防ぐ (メニューが画面を覆うので、取得中に別の画面へ移ることもない)
  const worldAuthorRequestRef = useRef<AbortController | null>(null);
  const [isFetchingWorldAuthor, setIsFetchingWorldAuthor] = useState(false);

  // メニューを閉じられたり画面を離れたりしたら、取得をやめて共有もしない
  const cancelWorldAuthorRequest = useCallback(() => {
    worldAuthorRequestRef.current?.abort();
    worldAuthorRequestRef.current = null;
  }, []);

  useEffect(() => cancelWorldAuthorRequest, [cancelWorldAuthorRequest]);

  const shareWithWorld = useCallback(async () => {
    if (!firstWorld || worldAuthorRequestRef.current) return;

    // 作成者を問い合わせられるのは VRChat のワールドだけ。それ以外 (ID が無い・他のプラットフォーム) は名前だけで共有する
    let author: string | null = null;
    if (isVRChatWorldId(firstWorld.platformIdentifier)) {
      // 投稿を開く回数に比べて共有は少ないので、作成者は共有するときに初めて問い合わせる
      const controller = new AbortController();
      worldAuthorRequestRef.current = controller;
      setIsFetchingWorldAuthor(true);
      const timer = setTimeout(() => controller.abort(), WORLD_AUTHOR_TIMEOUT_MS);
      author = await fetchVRChatWorldAuthorName(firstWorld.platformIdentifier, controller.signal);
      clearTimeout(timer);
      setIsFetchingWorldAuthor(false);

      // 取得中に cancelWorldAuthorRequest で外されていたら共有しない。タイムアウトなら作成者なしで共有する
      if (worldAuthorRequestRef.current !== controller) return;
      worldAuthorRequestRef.current = null;
    }
    menuSheetRef.current?.dismiss();

    const world = { ...firstWorld, author };
    Share.share({
      message: buildWorldShareText(
        status?.body ?? "",
        status?.user?.displayName ?? "",
        withShareUtm(statusUrl, "status", "share_sheet"),
        world,
      ),
    }).catch(() => {});
  }, [firstWorld, status, statusUrl]);

  const showMenu = useCallback(() => {
    menuSheetRef.current?.present();
  }, []);

  const handleMenuItemPress = useCallback(
    (action: MenuAction) => {
      // ワールド付き共有は、作成者を取り終えるまでメニューを閉じない
      if (action === "shareWithWorld") {
        shareWithWorld();
        return;
      }

      menuSheetRef.current?.dismiss();
      handleMenuAction(action);
    },
    [handleMenuAction, shareWithWorld],
  );

  const renderMenuBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  const user = status?.user;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <CatalystIconButton label="メニュー" size="sm" tone="ghost" onPress={showMenu}>
              <UniMoreHorizontal className="text-light-tint dark:text-dark-tint" />
            </CatalystIconButton>
          ),
        }}
      />

      {!status && isNotFound ? (
        <View className="flex-1 bg-light-background dark:bg-dark-background">
          <CatalystEmptyState
            title="投稿が見つかりません"
            description="削除されたか、アクセスできないコンテンツです"
            icon={<UniFileQuestion />}
          />
        </View>
      ) : !status ? (
        <StatusDetailPlaceholder />
      ) : (
        <ScrollView
          className="flex-1 bg-light-surface-muted dark:bg-dark-background"
          contentContainerClassName="pb-6"
        >
          <View className="bg-light-background dark:bg-dark-surface">
            <View className="px-5 pb-4 pt-4">
              <View className="flex-row items-center">
                <Pressable
                  accessibilityRole="button"
                  className="active:opacity-75"
                  onPress={() => user && router.push(`/user/${user.screenName}`)}
                >
                  <CatalystAvatar
                    source={
                      user?.profile?.iconUrl
                        ? getCdnUrl({ src: user.profile.iconUrl, variant: "icon", width: 96 })
                        : null
                    }
                    fallback={user?.displayName}
                    size="lg"
                  />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  className="ml-3 min-w-0 flex-1 active:opacity-75"
                  onPress={() => user && router.push(`/user/${user.screenName}`)}
                >
                  <View className="flex-row items-center gap-1">
                    <CatalystText variant="subtitle" className="min-w-0 shrink" numberOfLines={1}>
                      {user?.displayName ?? ""}
                    </CatalystText>
                    <ProfileEmoji emoji={user?.profileEmoji} size={16} />
                  </View>
                  <CatalystText variant="body" tone="muted" numberOfLines={1}>
                    @{user?.screenName ?? ""}
                  </CatalystText>
                </Pressable>

                <StatusVisibilityBadge className="ml-2 self-center" privacy={privacy} />
              </View>
            </View>

            {status.medias.length > 0 ? (
              <MediaCarousel
                medias={status.medias}
                createdAt={status.createdAt}
                onIndexChange={setCurrentMediaIndex}
                pins={mediaPins}
              />
            ) : null}

            <View className="px-5 py-4">
              {status.body.length > 0 ? (
                <View>
                  <StatusText
                    status={status.body}
                    textClassName="text-[17px] leading-6 text-light-text dark:text-dark-text"
                    linkClassName={cn("text-[17px] leading-6", catalystLinkClassName)}
                  />
                </View>
              ) : null}

              <View className={status.body.length > 0 ? "mt-4 flex-row items-center" : "flex-row items-center"}>
                <CatalystText variant="caption" tone="muted">
                  {abs(status.createdAt)}
                </CatalystText>
                <CatalystText variant="caption" tone="muted">
                  {" · "}
                  {rel(status.createdAt)}
                </CatalystText>
              </View>

              <View className="my-3 h-px bg-light-divider dark:bg-dark-divider" />

              <ActionBar
                isDefaultFavorited={isFavorited}
                isDefaultReposted={isReposted}
                status={status}
              />

              <View className="my-3 h-px bg-light-divider dark:bg-dark-divider" />

              <ReactionBar
                reactions={reactions}
                onReact={handleReact}
                onUnreact={handleUnreact}
                onAddReaction={isLoggedIn ? () => emojiPickerRef.current?.open() : undefined}
              />

              {contest ? (
                <View className="pt-3 py-2">
                  <ContestBanner contest={contest} />
                </View>
              ) : null}
              {weeklyTheme ? (
                <View className="pt-3 py-2">
                  <WeeklyThemeBanner theme={weeklyTheme} />
                </View>
              ) : null}
            </View>
          </View>

          {(() => {
            const currentMedia = status.medias[currentMediaIndex];
            const meta = currentMedia ? metadata[currentMedia.id] : undefined;
            if (!meta) return null;
            const hasContent =
              meta.platform ||
              meta.world?.name ||
              meta.users.length > 0 ||
              meta.reference.length > 0 ||
              Object.keys(meta.additionalData ?? {}).length > 0;
            if (!hasContent) return null;

            // 同一アイテムが同じ写真に複数回ピン留めされている場合は重複排除して表示する
            const uniqueItems = meta.reference.filter(
              (item, i, arr) => arr.findIndex((w) => w.reference === item.reference) === i,
            );

            return (
              <View className="mt-3 bg-light-background px-5 py-4 dark:bg-dark-surface">
                <CatalystText variant="subtitle" className="mb-2 text-[15px]">
                  メタデータ
                </CatalystText>
                {meta.platform ? (
                  <View className="flex-row border-b border-light-divider py-2 dark:border-dark-divider">
                    <CatalystText variant="caption" tone="muted" className="w-32">
                      撮影プラットフォーム
                    </CatalystText>
                    <CatalystText variant="caption" className="flex-1">
                      {meta.platform}
                    </CatalystText>
                  </View>
                ) : null}
                {meta.world?.name ? (
                  <View className="flex-row border-b border-light-divider py-2 dark:border-dark-divider">
                    <CatalystText variant="caption" tone="muted" className="w-32">
                      撮影ワールド
                    </CatalystText>
                    <Pressable
                      className="flex-1 active:opacity-75"
                      onPress={() =>
                        router.push(
                          `/search/${encodeURIComponent(`platform:${meta.platform} world:${quoteSearchQualifier(meta.world!.name)}`)}`,
                        )
                      }
                    >
                      <CatalystText variant="caption" tone="link">
                        {meta.world.name}
                      </CatalystText>
                    </Pressable>
                  </View>
                ) : null}
                {meta.users.length > 0 ? (
                  <View className="flex-row border-b border-light-divider py-2 dark:border-dark-divider">
                    <CatalystText variant="caption" tone="muted" className="w-32">
                      写っているユーザー
                    </CatalystText>
                    <CatalystText variant="caption" className="flex-1">
                      {meta.users.map((u) => u.displayName).join(", ")}
                    </CatalystText>
                  </View>
                ) : null}
                {uniqueItems.length > 0 ? (
                  <View className="flex-row border-b border-light-divider py-2 dark:border-dark-divider">
                    <CatalystText variant="caption" tone="muted" className="w-32">
                      着用アイテム
                    </CatalystText>
                    <View className="flex-1 gap-1.5">
                      {uniqueItems.map((item) => (
                        <View key={item.reference} className="flex-row flex-wrap items-center gap-1.5">
                          <CatalystBadge tone="neutral">
                            <CatalystBadgeText>{EPICLESE_ITEM_TYPE_LABELS[item.type] ?? item.type}</CatalystBadgeText>
                          </CatalystBadge>
                          <Pressable
                            accessibilityRole="link"
                            className="min-w-0 shrink active:opacity-75"
                            onPress={() => router.push(`/items/${item.reference}`)}
                          >
                            <CatalystText variant="caption" tone="link" numberOfLines={1}>
                              {item.name}
                            </CatalystText>
                          </Pressable>
                          <CatalystText variant="caption" tone="muted" numberOfLines={1} className="min-w-0 shrink">
                            by {item.author.name}
                          </CatalystText>
                          {item.externalUrl ? (
                            <Pressable
                              accessibilityRole="link"
                              accessibilityLabel="販売ページを見る"
                              hitSlop={6}
                              className="active:opacity-75"
                              onPress={() => item.externalUrl && openUrlWithBrowser(item.externalUrl)}
                            >
                              <UniExternalLink size={14} className="text-light-text-muted dark:text-dark-text-muted" />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                {Object.entries(meta.additionalData ?? {}).map(([key, value]) => {
                  const ref = meta.additionalData2?.[key]?.ref ?? "";
                  const isWorldLink = key === "World" && isVRChatWorldId(ref);
                  const isAuthorLink = ref.startsWith("usr_");
                  const searchQuery = isWorldLink
                    ? `platform:VRChat world:${quoteSearchQualifier(value)}`
                    : isAuthorLink
                      ? `takenBy:${ref}`
                      : null;
                  const displayValue = key === "TakenAt" ? abs(value) : value;

                  return (
                    <View key={key} className="flex-row border-b border-light-divider py-2 dark:border-dark-divider">
                      <CatalystText variant="caption" tone="muted" className="w-32">
                        {METADATA_LABELS[key] ?? key}
                      </CatalystText>
                      {searchQuery ? (
                        <Pressable
                          className="flex-1 active:opacity-75"
                          onPress={() => router.push(`/search/${encodeURIComponent(searchQuery)}`)}
                        >
                          <CatalystText variant="caption" tone="link">
                            {displayValue}
                          </CatalystText>
                        </Pressable>
                      ) : (
                        <CatalystText variant="caption" className="flex-1">
                          {displayValue}
                        </CatalystText>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })()}

        </ScrollView>
      )}

      {/* Edit caption sheet */}
      {Platform.OS === "ios" ? (
        <Modal visible={isEditSheetVisible} animationType="slide" presentationStyle="pageSheet">
          <View className="flex-1 bg-light-background dark:bg-dark-background">
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-light-border dark:border-dark-border">
              <Pressable className="active:opacity-70" onPress={() => setIsEditSheetVisible(false)}>
                <Text className="text-[17px] text-light-tint dark:text-dark-tint">キャンセル</Text>
              </Pressable>
              <Text className="text-[17px] font-semibold text-light-text dark:text-dark-text">キャプションを編集</Text>
              <Pressable
                className="active:opacity-70 disabled:opacity-40"
                onPress={handleEditSave}
                disabled={isEditingSaving || editingCaption.length === 0}
              >
                <Text
                  className={cn(
                    "text-[17px] font-semibold text-light-tint dark:text-dark-tint",
                    (isEditingSaving || editingCaption.length === 0) && "opacity-40",
                  )}
                >
                  保存
                </Text>
              </Pressable>
            </View>
            <TextInput
              className="flex-1 p-4 text-base text-light-text dark:text-dark-text"
              value={editingCaption}
              onChangeText={setEditingCaption}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </View>
        </Modal>
      ) : (
        <Modal visible={isEditSheetVisible} animationType="fade">
          <UniSafeAreaView className="flex-1 bg-light-background dark:bg-dark-background">
            <View
              className="flex-row items-center px-1 py-2 bg-light-background dark:bg-dark-background"
              style={{ elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 2 }}
            >
              <Pressable onPress={() => setIsEditSheetVisible(false)} className="p-3 active:opacity-70">
                <UniArrowLeft size={24} className="text-light-text dark:text-dark-text" />
              </Pressable>
              <Text className="flex-1 text-lg font-medium ml-2 text-light-text dark:text-dark-text">
                キャプションを編集
              </Text>
              <Pressable
                onPress={handleEditSave}
                disabled={isEditingSaving || editingCaption.length === 0}
                className={cn(
                  "m-2 rounded-full bg-light-tint px-4 py-2 active:opacity-80 dark:bg-dark-tint",
                  (isEditingSaving || editingCaption.length === 0) && "opacity-40",
                )}
              >
                <UniCheck size={22} className="text-light-tint-foreground dark:text-dark-tint-foreground" />
              </Pressable>
            </View>
            <TextInput
              className="flex-1 p-4 text-base text-light-text dark:text-dark-text"
              value={editingCaption}
              onChangeText={setEditingCaption}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </UniSafeAreaView>
        </Modal>
      )}

      {/* Album selection modal */}
      <AlbumSelectionModal
        visible={isAlbumSelectionVisible}
        statusId={id}
        mode={albumSelectionMode}
        onClose={() => setIsAlbumSelectionVisible(false)}
      />

      {/* Reaction picker sheet */}
      <EmojiPickerSheet ref={emojiPickerRef} onReact={handleReact} />

      {/* Action menu */}
      <BottomSheetModal
        ref={menuSheetRef}
        onDismiss={cancelWorldAuthorRequest}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderMenuBackdrop}
        backgroundStyle={{ backgroundColor: theme === "dark" ? "#1C1C1E" : "#FFFFFF" }}
        handleIndicatorStyle={{ backgroundColor: theme === "dark" ? "#48484A" : "#C7C7CC" }}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom * 2 }}>
          {isLoggedIn && (
            <View>
              <CatalystActionSheetItem
                icon={UniBookmark}
                title="アルバムへ追加"
                onPress={() => handleMenuItemPress("addToAlbum")}
                tone="accent"
              />
              <CatalystDivider className="ml-14 w-auto" />
              <CatalystActionSheetItem
                icon={UniBookmarkMinus}
                title="アルバムから削除"
                onPress={() => handleMenuItemPress("removeFromAlbum")}
                tone="accent"
              />
              <CatalystDivider className="my-2" />
            </View>
          )}
          {isMyself && (
            <View>
              <CatalystActionSheetItem icon={UniPencil} title="編集する" onPress={() => handleMenuItemPress("edit")} />
              <CatalystDivider className="ml-14 w-auto" />
              <CatalystActionSheetItem
                icon={UniTags}
                title="メタデータを編集"
                onPress={() => handleMenuItemPress("editMetadata")}
              />
              <CatalystDivider className="ml-14 w-auto" />
              <CatalystActionSheetItem
                icon={UniTrash2}
                title="削除する"
                onPress={() => handleMenuItemPress("delete")}
                tone="destructive"
              />
            </View>
          )}
          {!isMyself && isLoggedIn && (
            <CatalystActionSheetItem
              icon={UniFlag}
              title="報告する"
              onPress={() => handleMenuItemPress("report")}
              tone="destructive"
            />
          )}
          <View>
            {isLoggedIn && <CatalystDivider className="my-2" />}
            <CatalystActionSheetItem
              icon={UniExternalLink}
              title="ブラウザで開く"
              onPress={() => handleMenuItemPress("openInBrowser")}
              tone="accent"
            />
            <CatalystDivider className="ml-14 w-auto" />
            <CatalystActionSheetItem
              icon={UniClipboardIcon}
              title="URL をコピー"
              onPress={() => handleMenuItemPress("copyUrl")}
              tone="accent"
            />
            <CatalystDivider className="ml-14 w-auto" />
            <CatalystActionSheetItem
              icon={UniClipboardIcon}
              title="投稿をコピー"
              onPress={() => handleMenuItemPress("copyPost")}
              tone="accent"
            />
            <CatalystDivider className="ml-14 w-auto" />
            <CatalystActionSheetItem
              icon={UniSend}
              title="共有する"
              onPress={() => handleMenuItemPress("share")}
              tone="accent"
            />
            {firstWorld && (
              <>
                <CatalystDivider className="ml-14 w-auto" />
                <CatalystActionSheetItem
                  icon={UniGlobe}
                  title={isFetchingWorldAuthor ? "ワールド情報を取得中…" : "ワールド情報を付けて共有"}
                  disabled={isFetchingWorldAuthor}
                  className={isFetchingWorldAuthor ? "opacity-60" : undefined}
                  onPress={() => handleMenuItemPress("shareWithWorld")}
                  tone="accent"
                />
              </>
            )}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
