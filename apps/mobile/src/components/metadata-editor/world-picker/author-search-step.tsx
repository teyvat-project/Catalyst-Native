import { CatalystListItem, CatalystSearchField, CatalystText } from "@/components/design-system";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { clientAtom } from "@/models/atoms/credential";
import type { EpicleseAuthorResponse, EpiclesePlatformResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PickerHeader } from "../picker-header";

type Props = {
  // 省略するとプラットフォームを問わず検索する (アイテムの作者で絞り込むときなど)
  platform?: EpiclesePlatformResponse;
  title?: string;
  // 結果の先頭に出す、作者を選ばない選択肢 (「すべての作者」など)
  allOption?: { label: string; onSelect: () => void };
  onBack: () => void;
  onSelect: (author: EpicleseAuthorResponse) => void;
  // 省略すると「見つからない場合は作者を登録」を出さない
  onRegister?: () => void;
};

export const AuthorSearchStep = ({
  platform,
  title = "ワールド作者",
  allOption,
  onBack,
  onSelect,
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
  const { results, isLoading, isError, retry } = useDebouncedSearch(query, fetchAuthors);

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
          data={results}
          keyExtractor={(author) => author.id}
          keyboardShouldPersistTaps="handled"
          // 末尾の行がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator className="py-8" colorClassName="accent-light-tint dark:accent-dark-tint" />
            ) : (
              <CatalystText tone="muted" className="px-6 py-8 text-center">
                一致する作者が見つかりませんでした。
              </CatalystText>
            )
          }
          ListHeaderComponent={
            allOption ? (
              <CatalystListItem onPress={allOption.onSelect} accessibilityRole="button" className="px-4">
                <CatalystText variant="label" className="flex-1">
                  {allOption.label}
                </CatalystText>
              </CatalystListItem>
            ) : undefined
          }
          ListFooterComponent={
            onRegister ? (
              <Pressable onPress={onRegister} className="px-4 py-5">
                <CatalystText tone="tint">見つからない場合は作者を登録</CatalystText>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item: author }) => (
            <CatalystListItem onPress={() => onSelect(author)} accessibilityRole="button" className="px-4">
              <View className="min-w-0 flex-1">
                <CatalystText variant="label" numberOfLines={1}>
                  {author.name}
                </CatalystText>
                <CatalystText variant="caption" tone="muted" numberOfLines={1}>
                  {author.platformIdentifier}
                </CatalystText>
              </View>
            </CatalystListItem>
          )}
        />
      )}
    </>
  );
};
