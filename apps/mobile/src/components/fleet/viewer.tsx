import { FleetContent, FleetContentData } from "@/components/fleet/content";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { getCdnUrl, getIdenticonUrl } from "@/lib/media";
import { FLEET_PACE_DURATIONS } from "@/models/accessibility-settings";
import { fleetPaceAtom } from "@/models/atoms/accessibility";
import { accountAtom } from "@/models/atoms/account";
import { clientAtom } from "@/models/atoms/credential";
import { hideSensitiveContentAtom } from "@/models/atoms/sensitive-content";
import type { CatalystCustomReaction, CatalystFleet } from "@/models/sdk-types";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { Ellipsis, MessageCircleHeart, SmilePlus } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);
const UniEllipsis = withUniwind(Ellipsis);
const UniSmilePlus = withUniwind(SmilePlus);
const UniMessageCircleHeart = withUniwind(MessageCircleHeart);

type Props = {
  username: string | null;
  usernames: string[];
  visible: boolean;
  onClose: () => void;
  onMarkRead: (username: string) => void;
};

const toFleetContentData = (fleet: CatalystFleet): FleetContentData => ({
  backgroundColor: fleet.backgroundColor,
  media: fleet.media
    ? {
        url: fleet.media.url,
        alt: fleet.media.alt,
        width: fleet.media.width ?? undefined,
        height: fleet.media.height ?? undefined,
        placement: fleet.media.placement,
      }
    : null,
  stickers: fleet.stickers.map((s) => ({
    emoji: s.emoji,
    id: s.id,
    posX: s.posX,
    posY: s.posY,
    rotation: s.rotation,
    scale: s.scale,
  })),
  texts: fleet.texts.map((t) => ({
    id: t.id,
    body: t.body,
    color: t.color,
    backgroundColor: t.backgroundColor,
    posX: t.posX,
    posY: t.posY,
    rotation: t.rotation,
    scale: t.scale,
    textAlignment: t.textAlignment as "left" | "center" | "right",
    textStyle: t.textStyle as "default" | "bold" | "serif" | "handwriting",
  })),
});

type ProgressBarState = "past" | "current" | "future";

type ProgressBarProps = {
  state: ProgressBarState;
  paused: boolean;
  /** 1 枚あたりの表示時間 (ミリ秒)。null のときは自動送りせず、現在位置だけを示す */
  duration: number | null;
  onComplete: () => void;
};

const ProgressBar = ({ state, paused, duration, onComplete }: ProgressBarProps) => {
  const progress = useSharedValue(state === "past" ? 1 : 0);
  const prevStateRef = useRef(state);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    if (state !== "current") {
      cancelAnimation(progress);
      progress.value = state === "past" ? 1 : 0;
      return;
    }

    if (duration === null) {
      // 自動送りをしない設定。タイマーを動かさず、現在位置を塗りつぶしで示す
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }

    if (paused) {
      cancelAnimation(progress);
      return;
    }

    if (prevState !== "current" || progress.value >= 1) {
      // 別の状態から "current" に遷移した場合、および「自動で進めない」設定から
      // 切り替わって進捗が振り切っている場合は 0 から開始
      cancelAnimation(progress);
      progress.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration }, (finished) => {
          if (finished) runOnJS(handleComplete)();
        }),
      );
    } else {
      // pause 解除などで再開する場合は現在位置から続行
      const remaining = duration * (1 - progress.value);
      progress.value = withTiming(1, { duration: remaining }, (finished) => {
        if (finished) runOnJS(handleComplete)();
      });
    }
  }, [state, paused, duration, handleComplete, progress]);

  const filledStyle = useAnimatedStyle(() => ({ flex: progress.value }));
  const emptyStyle = useAnimatedStyle(() => ({ flex: 1 - progress.value }));

  return (
    <View className="flex-1 h-[2.5px] flex-row rounded-full overflow-hidden">
      <Animated.View className="bg-white" style={filledStyle} />
      <Animated.View className="bg-white/40" style={emptyStyle} />
    </View>
  );
};

export const FleetViewer = ({ username, usernames, visible, onClose, onMarkRead }: Props) => {
  const client = useAtomValue(clientAtom);
  const account = useAtomValue(accountAtom);
  const hideSensitiveContent = useAtomValue(hideSensitiveContentAtom);
  const fleetPace = useAtomValue(fleetPaceAtom);
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [fleets, setFleets] = useState<CatalystFleet[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [isReactionPanelOpen, setIsReactionPanelOpen] = useState(false);
  const [reactionSymbols, setReactionSymbols] = useState<CatalystCustomReaction[] | null>(null);
  const [isReacting, setIsReacting] = useState(false);
  // 確認ダイアログ表示中に自動送りが進むと、消す対象と画面の Fleet がずれる
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const activeUsernameRef = useRef(activeUsername);
  const usernamesRef = useRef(usernames);
  const fleetsRef = useRef(fleets);

  // 外部から username が変わったら activeUsername を同期
  useEffect(() => {
    if (visible && username) {
      // Fleet viewer の表示対象を外部選択に同期するため、ここで state に反映する。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveUsername(username);
    }
  }, [visible, username]);

  useEffect(() => {
    if (!visible || !activeUsername || !client) return;
    // Fleet 取得開始時にビューアーのローカル表示状態を初期化する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setCurrentIndex(0);
    client.catalyst.v1.fleet.by.user.username
      .get({
        path: { username: activeUsername },
        query: hideSensitiveContent ? { exclude_sensitive: true } : undefined,
        throwOnError: true,
      })
      .then(({ data }) => {
        setFleets(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
        onClose();
      });
  }, [visible, activeUsername, client, hideSensitiveContent, onClose]);

  useEffect(() => {
    // Fleet の切り替え時にメディア読み込み状態とリアクションパネルをリセットする。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMediaLoaded(false);
    setIsReactionPanelOpen(false);
  }, [currentIndex]);

  // リアクションパネルを開いた際、マスターリアクション一覧を初回のみ取得する
  useEffect(() => {
    if (!isReactionPanelOpen || reactionSymbols !== null || !client) return;
    client.catalyst.v1.reactions
      .get({ throwOnError: true })
      .then(({ data }) => setReactionSymbols(data))
      .catch(() => setReactionSymbols([]));
  }, [isReactionPanelOpen, reactionSymbols, client]);

  useEffect(() => {
    if (!visible || isLoading || fleets.length === 0 || !client) return;
    const fleet = fleets[currentIndex];
    if (fleet) {
      client.catalyst.v1.fleet.id.view
        .create({ path: { id: fleet.id }, throwOnError: true })
        .catch(() => {});
    }
  }, [visible, isLoading, currentIndex, fleets, client]);

  useEffect(() => {
    activeUsernameRef.current = activeUsername;
  }, [activeUsername]);

  useEffect(() => {
    usernamesRef.current = usernames;
  }, [usernames]);

  useEffect(() => {
    fleetsRef.current = fleets;
  }, [fleets]);

  // ユーザー操作で進行/後退した際にインクリメントし、古い自動進行を無視する
  const navEpochRef = useRef(0);

  const autoAdvance = useCallback(() => {
    const epoch = navEpochRef.current;
    setCurrentIndex((prev) => {
      // ユーザーが手動でナビゲーションした場合、この自動進行を無視
      if (navEpochRef.current !== epoch) return prev;
      if (prev + 1 >= fleetsRef.current.length) {
        const name = activeUsernameRef.current;
        if (name) onMarkRead(name);
        const userIndex = usernamesRef.current.indexOf(name ?? "");
        if (userIndex >= 0 && userIndex + 1 < usernamesRef.current.length) {
          setActiveUsername(usernamesRef.current[userIndex + 1]);
          return 0;
        }
        onClose();
        return prev;
      }
      return prev + 1;
    });
  }, [onClose, onMarkRead]);

  const goNext = useCallback(() => {
    navEpochRef.current += 1;
    setCurrentIndex((prev) => {
      if (prev + 1 >= fleetsRef.current.length) {
        const name = activeUsernameRef.current;
        if (name) onMarkRead(name);
        const userIndex = usernamesRef.current.indexOf(name ?? "");
        if (userIndex >= 0 && userIndex + 1 < usernamesRef.current.length) {
          setActiveUsername(usernamesRef.current[userIndex + 1]);
          return 0;
        }
        onClose();
        return prev;
      }
      return prev + 1;
    });
  }, [onClose, onMarkRead]);

  const goPrev = useCallback(() => {
    navEpochRef.current += 1;
    setCurrentIndex((prev) => {
      if (prev === 0) {
        const name = activeUsernameRef.current;
        const userIndex = usernamesRef.current.indexOf(name ?? "");
        if (userIndex > 0) {
          setActiveUsername(usernamesRef.current[userIndex - 1]);
        }
        return 0;
      }
      return prev - 1;
    });
  }, []);

  const handleMediaLoad = useCallback(() => {
    setIsMediaLoaded(true);
  }, []);

  const currentFleet = fleets[currentIndex];
  const contentData = currentFleet ? toFleetContentData(currentFleet) : null;
  const isMyFleet = !!currentFleet && currentFleet.user.id === account?.user?.id;

  const handleToggleReactionPanel = useCallback(() => {
    setIsReactionPanelOpen((prev) => !prev);
  }, []);

  const handleReact = useCallback(
    async (symbol: string) => {
      if (!client || !currentFleet || isReacting) return;
      const fleetId = currentFleet.id;
      const isRemoving = currentFleet.selfReaction?.symbol === symbol;

      setIsReacting(true);
      try {
        if (isRemoving) {
          await client.catalyst.v1.fleet.id.reactions.symbol.delete({
            path: { id: fleetId, symbol },
            throwOnError: true,
          });
          setFleets((prev) => prev.map((f) => (f.id === fleetId ? { ...f, selfReaction: null } : f)));
        } else {
          const { data } = await client.catalyst.v1.fleet.id.reactions.symbol.create({
            path: { id: fleetId, symbol },
            throwOnError: true,
          });
          setFleets((prev) => prev.map((f) => (f.id === fleetId ? { ...f, selfReaction: data.value } : f)));
        }
        setIsReactionPanelOpen(false);
      } catch {
        Alert.alert("エラー", "リアクションの操作に失敗しました");
      } finally {
        setIsReacting(false);
      }
    },
    [client, currentFleet, isReacting],
  );

  const handleOpenReactionsList = useCallback(() => {
    if (!currentFleet) return;
    const fleetId = currentFleet.id;
    onClose();
    router.push(`/fleet/${fleetId}/reactions`);
  }, [currentFleet, onClose, router]);

  /** 自分の Fleet を削除する。Web 版と同じく確認してから消す。 */
  const handleDelete = useCallback(() => {
    if (!client || !currentFleet) return;
    const fleetId = currentFleet.id;

    setIsConfirmingDelete(true);
    Alert.alert("Fleet を削除しますか？", "この操作は取り消せません。表示中の Fleet を削除しますか？", [
      { text: "キャンセル", style: "cancel", onPress: () => setIsConfirmingDelete(false) },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await client.catalyst.v1.fleet.id.delete({ path: { id: fleetId }, throwOnError: true });
          } catch (error) {
            console.error("Failed to delete fleet:", error);
            Alert.alert("エラー", "Fleet を削除できませんでした");
            setIsConfirmingDelete(false);
            return;
          }

          // 表示中の一覧からも取り除く。残りが無ければビューアーごと閉じる
          const remaining = fleetsRef.current.filter((fleet) => fleet.id !== fleetId);
          if (remaining.length === 0) {
            onClose();
            setIsConfirmingDelete(false);
            return;
          }

          // 削除前のインデックスを前提にした自動送りが走らないようにする
          navEpochRef.current += 1;
          setFleets(remaining);
          // 先頭を消した場合はインデックスが変わらないので、切り替え時のリセットを自分で行う
          setCurrentIndex((prev) => Math.min(prev, remaining.length - 1));
          setIsMediaLoaded(false);
          setIsReactionPanelOpen(false);
          setIsConfirmingDelete(false);
        },
      },
    ]);
  }, [client, currentFleet, onClose]);

  const handleReport = useCallback(() => {
    if (!currentFleet) return;
    const fleetId = currentFleet.id;
    Alert.alert("Fleet を報告しますか？", undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "報告する",
        style: "destructive",
        onPress: () => {
          onClose();
          router.push(`/report/${fleetId}?type=fleet`);
        },
      },
    ]);
  }, [currentFleet, onClose, router]);

  const iconUrl = currentFleet?.user.profile?.iconUrl
    ? getCdnUrl({ src: currentFleet.user.profile.iconUrl, variant: "icon", width: 64 })
    : getIdenticonUrl(currentFleet?.user.id);

  const isPaused = !!(currentFleet?.media && !isMediaLoaded) || isReactionPanelOpen || isConfirmingDelete;
  const fleetDuration = FLEET_PACE_DURATIONS[fleetPace];

  const getProgressBarState = (index: number): ProgressBarState => {
    if (index < currentIndex) return "past";
    if (index === currentIndex) return "current";
    return "future";
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        {/* Fleet content — full screen */}
        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator colorClassName="accent-white" size="large" />
          </View>
        ) : contentData ? (
          <View className="flex-1">
            <FleetContent key={currentFleet?.id} fleet={contentData} onMediaLoad={currentFleet?.media ? handleMediaLoad : undefined} />
            {/* Media loading overlay */}
            {currentFleet?.media && !isMediaLoaded && (
              <View className="absolute inset-0 justify-center items-center bg-black/30">
                <ActivityIndicator colorClassName="accent-white" size="large" />
              </View>
            )}
          </View>
        ) : null}

        {/* Header overlay: progress bars + user info */}
        {!isLoading && fleets.length > 0 && (
          <View
            className="absolute z-10"
            style={{ top: insets.top + 8, left: insets.left, right: insets.right }}
            pointerEvents="none"
          >
            <View className="flex-row gap-1 px-3 pb-2">
              {fleets.map((fleet, i) => (
                <ProgressBar
                  key={fleet.id}
                  state={getProgressBarState(i)}
                  paused={i === currentIndex ? isPaused : false}
                  duration={fleetDuration}
                  onComplete={autoAdvance}
                />
              ))}
            </View>
            {currentFleet && (
              <View className="flex-row items-center px-3 pb-2">
                <UniImage source={{ uri: iconUrl }} className="w-8 h-8 rounded-full" contentFit="cover" />
                <Text className="text-white ml-2 font-semibold text-sm flex-1" numberOfLines={1}>
                  {currentFleet.user.displayName || currentFleet.user.screenName}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Tap areas: left = prev, right = next */}
        <View className="absolute inset-0 flex-row" pointerEvents="box-none">
          <Pressable className="flex-1" onPress={goPrev} />
          <Pressable className="flex-1" onPress={goNext} />
        </View>

        {/* More menu — 自分の Fleet なら削除、他人の Fleet なら報告 */}
        {!isLoading && currentFleet && account && (
          <Pressable
            accessibilityLabel={isMyFleet ? "Fleet を削除" : "Fleet を報告"}
            onPress={isMyFleet ? handleDelete : handleReport}
            className="absolute z-20 w-8 h-8 justify-center items-center"
            style={{ top: insets.top + 48, right: insets.right + 96 }}
            hitSlop={8}
          >
            <UniEllipsis size={20} className="text-white" />
          </Pressable>
        )}

        {/* Reaction trigger button */}
        {!isLoading && currentFleet && account && (
          <Pressable
            onPress={isMyFleet ? handleOpenReactionsList : handleToggleReactionPanel}
            disabled={!isMyFleet && isReacting}
            className={cn(
              "absolute z-20 w-8 h-8 justify-center items-center rounded-full",
              !isMyFleet && currentFleet.selfReaction && "bg-white/25",
              !isMyFleet && isReacting && "opacity-60",
            )}
            style={{ top: insets.top + 48, right: insets.right + 56 }}
            hitSlop={8}
          >
            {isMyFleet ? (
              <UniMessageCircleHeart size={20} className="text-white" />
            ) : currentFleet.selfReaction ? (
              <UniImage source={{ uri: currentFleet.selfReaction.url }} className="w-5 h-5" contentFit="contain" />
            ) : (
              <UniSmilePlus size={20} className="text-white" />
            )}
          </Pressable>
        )}

        {/* Close button */}
        <Pressable
          onPress={onClose}
          className="absolute z-20 w-8 h-8 justify-center items-center"
          style={{ top: insets.top + 48, right: insets.right + 16 }}
          hitSlop={16}
        >
          <Text className="text-white text-lg font-semibold">✕</Text>
        </Pressable>

        {/* Reaction panel: 右上のトリガーボタンの下から右揃えで展開する（画面幅を超える場合は横スクロール） */}
        {isReactionPanelOpen && (
          <View
            className="absolute z-20 items-end"
            style={{ top: insets.top + 88, left: insets.left + 16, right: insets.right + 16 }}
            pointerEvents="box-none"
          >
            {reactionSymbols === null ? (
              <View className="rounded-full bg-black/60 px-4 py-3">
                <ActivityIndicator colorClassName="accent-white" size="small" />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="max-w-full rounded-full bg-black/60"
                contentContainerClassName="flex-row items-center gap-1 px-2 py-2"
              >
                {reactionSymbols.map((r) => (
                  <Pressable
                    key={r.symbol}
                    onPress={() => handleReact(r.symbol)}
                    disabled={isReacting}
                    hitSlop={4}
                    className={cn(
                      "w-10 h-10 items-center justify-center rounded-full",
                      currentFleet?.selfReaction?.symbol === r.symbol && "bg-white/25",
                    )}
                  >
                    <UniImage source={{ uri: r.url }} className="w-7 h-7" contentFit="contain" />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};
