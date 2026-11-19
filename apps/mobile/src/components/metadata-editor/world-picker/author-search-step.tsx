import { CatalystListItem, CatalystSearchField, CatalystText } from "@/components/design-system";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { clientAtom } from "@/models/atoms/credential";
import { forgetRecentAuthor, loadRecentAuthors, type RecentAuthor } from "@/models/epiclese-recent-authors";
import type { EpicleseAuthorResponse, EpiclesePlatformResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PickerHeader } from "../picker-header";
import {
  forgetOnLongPress,
  PICK_LIST_CLASS,
  PICK_ROW_CLASS,
  PickGroup,
  PickSeparator,
  PickTrailing,
  SectionLabel,
  useRefetchOnPick,
} from "../recent-picks";

type Props = {
  // 省略するとプラットフォームを問わず検索する (アイテムの作者で絞り込むときなど)
  platform?: EpiclesePlatformResponse;
  title?: string;
  // 結果の先頭に出す、作者を選ばない選択肢 (「すべての作者」など)
  allOption?: { label: string; onSelect: () => void };
  onBack: () => void;
  onSelect: (author: EpicleseAuthorResponse) => void;
  // 選択中の作者。チェックを付ける。allOption があって選択中の作者が無ければ、allOption にチェックを付ける
  selectedId?: string;
  // 検索欄が空のときに、最近使った作者を先頭に出す (アイテムの作者で絞り込むとき)。
  // 最近使った作者はプラットフォームを問わないので、platform を渡す検索では使わない
  showsRecent?: boolean;
  // 省略すると「見つからない場合は作者を登録」を出さない
  onRegister?: () => void;
};

export const AuthorSearchStep = ({
  platform,
  title = "ワールド作者",
  allOption,
  onBack,
  onSelect,
  selectedId,
  showsRecent = false,
  onRegister,
}: Props) => {
  const client = useAtomValue(clientAtom);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const platformId = platform?.id;
  const fetchAuthors = useCallback(
    async (q: string) => {
      const { data } = await client.epiclese.v1.authors.get({
        query: platformId ? { q, platform: platformId } : { q },
        throwOnError: true,
      });
      return data.items;
    },
    [client, platformId],
  );
  const { results, resultsQuery, isLoading, isError, retry } = useDebouncedSearch(query, fetchAuthors);

  const [recentAuthors, setRecentAuthors] = useState<RecentAuthor[]>([]);
  useEffect(() => {
    if (showsRecent) loadRecentAuthors().then(setRecentAuthors);
  }, [showsRecent]);

  // 出し分けはアイテム検索と同じく results の問い合わせに合わせ、名前などは検索結果にあればそちらを使う
  const latest = new Map(results.map((author) => [author.id, author]));
  const shownRecentAuthors =
    showsRecent && resultsQuery?.trim() === "" ? recentAuthors.map((author) => latest.get(author.id) ?? author) : [];
  const recentIds = new Set(shownRecentAuthors.map((author) => author.id));
  const listAuthors = results.filter((author) => !recentIds.has(author.id));

  const forgetAuthor = (id: string) => {
    forgetRecentAuthor(id).catch(() => {});
    setRecentAuthors((prev) => prev.filter((recent) => recent.id !== id));
  };

  // 検索結果の作者はそのまま、最近使った作者で検索結果に無いものは取り直してから選ぶ
  const { verifyingId, pick } = useRefetchOnPick({
    kind: "作者",
    fetch: async (id) => {
      const { data, response } = await client.epiclese.v1.authors.id.get({ path: { id } });
      return { data: data?.author, response };
    },
    onGone: forgetAuthor,
  });

  const renderAuthor = (author: RecentAuthor, isRecent: boolean) => (
    <CatalystListItem
      key={author.id}
      onPress={() => void pick(author.id, latest.get(author.id), onSelect)}
      {...(isRecent &&
        author.id !== verifyingId &&
        forgetOnLongPress({ name: author.name, section: "最近使った作者", onForget: () => forgetAuthor(author.id) }))}
      accessibilityRole="button"
      accessibilityState={{ selected: author.id === selectedId }}
      divided={false}
      className={`px-4 ${PICK_ROW_CLASS}`}
    >
      <View className="min-w-0 flex-1">
        <CatalystText variant="label" numberOfLines={1}>
          {author.name}
        </CatalystText>
        <CatalystText variant="caption" tone="muted" numberOfLines={1}>
          {author.platformIdentifier}
        </CatalystText>
      </View>
      <PickTrailing verifying={author.id === verifyingId} selected={author.id === selectedId} />
    </CatalystListItem>
  );

  return (
    <>
      <PickerHeader title={title} left={{ label: "戻る", onPress: onBack }} />
      <View className="px-4 py-3">
        <CatalystSearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
          placeholder="作者名もしくは ID を入力..."
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isError ? (
        <View className="items-center gap-3 px-6 py-8">
          <CatalystText tone="muted">読み込みに失敗しました</CatalystText>
          <Pressable onPress={retry} hitSlop={8}>
            <CatalystText tone="tint">再読み込み</CatalystText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listAuthors}
          keyExtractor={(author) => author.id}
          keyboardShouldPersistTaps="handled"
          // 末尾の行がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る
          className={PICK_LIST_CLASS}
          ItemSeparatorComponent={PickSeparator}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator className="py-8" colorClassName="accent-light-tint dark:accent-dark-tint" />
            ) : shownRecentAuthors.length > 0 ? undefined : (
              <CatalystText tone="muted" className="px-6 py-8 text-center">
                一致する作者が見つかりませんでした。
              </CatalystText>
            )
          }
          ListHeaderComponent={
            allOption || shownRecentAuthors.length > 0 ? (
              <View>
                {allOption && (
                  <CatalystListItem
                    onPress={allOption.onSelect}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !selectedId }}
                    divided={false}
                    className={`px-4 ${PICK_ROW_CLASS}`}
                  >
                    <CatalystText variant="label" className="flex-1">
                      {allOption.label}
                    </CatalystText>
                    <PickTrailing verifying={false} selected={!selectedId} />
                  </CatalystListItem>
                )}
                {shownRecentAuthors.length > 0 && (
                  <>
                    <SectionLabel>最近使った作者</SectionLabel>
                    <PickGroup>{shownRecentAuthors.map((author) => renderAuthor(author, true))}</PickGroup>
                  </>
                )}
                {/* 「すべての作者」や最近使った作者と、検索結果の面を分ける */}
                {(isLoading || listAuthors.length > 0) && <SectionLabel>作者一覧</SectionLabel>}
              </View>
            ) : undefined
          }
          ListFooterComponent={
            onRegister ? (
              <Pressable onPress={onRegister} className="px-4 py-5">
                <CatalystText tone="tint">見つからない場合は作者を登録</CatalystText>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item: author }) => renderAuthor(author, false)}
        />
      )}
    </>
  );
};
