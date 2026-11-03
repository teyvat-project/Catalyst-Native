import { CatalystText } from "@/components/design-system";
import { clientAtom } from "@/models/atoms/credential";
import { useFocusEffect, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { ArrowRight, CalendarDays, History } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Toast from "react-native-toast-message";
import { withUniwind } from "uniwind";

const UniArrowRightIcon = withUniwind(ArrowRight);
const UniHistoryIcon = withUniwind(History);
const UniCalendarDaysIcon = withUniwind(CalendarDays);

type DiscoverCardProps = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  disabled?: boolean;
  onPress: () => void;
};

// Web 版の検索 (キーワードなし) に出ているカードと同じ構成
const DiscoverCard = ({ icon: Icon, eyebrow, title, description, action, disabled, onPress }: DiscoverCardProps) => {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className="gap-3 rounded-xl bg-light-surface p-4 active:opacity-80 dark:bg-dark-surface"
    >
      <View className="flex-row items-center gap-2">
        <Icon size={16} className="text-light-text-muted dark:text-dark-text-muted" />
        <CatalystText variant="mono" tone="muted" className="tracking-widest">
          {eyebrow}
        </CatalystText>
      </View>
      <View className="gap-1">
        <CatalystText variant="title">{title}</CatalystText>
        <CatalystText tone="muted" numberOfLines={2}>
          {description}
        </CatalystText>
      </View>
      <View className="flex-row items-center justify-between">
        <CatalystText variant="label">{action}</CatalystText>
        <UniArrowRightIcon size={16} className="text-light-text-muted dark:text-dark-text-muted" />
      </View>
    </Pressable>
  );
};

/** 投稿検索タブでキーワードが無いときに出す、過去の投稿を振り返る入り口 */
export const StatusesPlaceholder = () => {
  const router = useRouter();
  const client = useAtomValue(clientAtom);
  const [isSearching, setIsSearching] = useState(false);
  // state は再描画の後にしか反映されないので、素早い二度押しは ref で弾く
  const isSearchingRef = useRef(false);
  // 押すたびと画面を離れるたびに番号を進め、それより前に出したリクエストの結果では遷移しない
  const attemptRef = useRef(0);

  // 見つかったときは「探しています」のまま遷移させ、文言が一瞬戻って見えないようにする。
  // 投稿から戻ってきたときに元の文言へ戻す
  useFocusEffect(
    useCallback(() => {
      isSearchingRef.current = false;
      setIsSearching(false);
      return () => {
        attemptRef.current++;
      };
    }, []),
  );

  // Web 版は説明とボタンだけのページを挟むが、アプリではカードを押したらすぐ投稿を開く
  const openOnThisDay = useCallback(async () => {
    if (!client || isSearchingRef.current) return;

    const attempt = ++attemptRef.current;
    isSearchingRef.current = true;
    setIsSearching(true);

    // 404 は過去のこの日に投稿が無いとき。それ以外は通信やサーバーの失敗なので、すぐやり直せば開けることがある
    const fail = (isNotFound: boolean) => {
      isSearchingRef.current = false;
      setIsSearching(false);
      Toast.show(
        isNotFound
          ? { type: "error", text1: "この日の投稿を見つけられませんでした", text2: "別の日にもう一度お試しください。" }
          : { type: "error", text1: "思い出を読み込めませんでした", text2: "時間をおいてもう一度お試しください" },
      );
    };

    try {
      const { data, response } = await client.catalyst.v11.onThisDay.get();
      // 探している間に別の画面へ移っていたら (戻ってきた後も)、勝手に投稿を開かない
      if (attempt !== attemptRef.current) return;
      if (data) {
        router.push(`/status/${data.id}`);
      } else {
        fail(response.status === 404);
      }
    } catch {
      if (attempt === attemptRef.current) fail(false);
    }
  }, [client, router]);

  return (
    <ScrollView contentContainerClassName="gap-4 px-3 pt-4 pb-6">
      <DiscoverCard
        icon={UniHistoryIcon}
        eyebrow="過去のこの日"
        title="On This Day"
        description="過去の同じ日に投稿された写真を1つ表示します。思いがけない思い出に再会できるかもしれません。"
        action={isSearching ? "思い出を探しています..." : "今日の思い出を見る"}
        disabled={isSearching}
        onPress={openOnThisDay}
      />
      <DiscoverCard
        icon={UniCalendarDaysIcon}
        eyebrow="アーカイブ"
        title="月間アーカイブ"
        description="過去の投稿を月別に振り返ることができます。"
        action="過去の投稿を振り返る"
        onPress={() => router.push("/archive")}
      />
    </ScrollView>
  );
};
