import { CatalystListItem, CatalystSearchField, CatalystText } from "@/components/design-system";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { clientAtom } from "@/models/atoms/credential";
import { ITEM_TYPE_LABELS, type EditablePin } from "@/models/epiclese-pin-editor";
import type { EpicleseAuthorResponse, EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { Check } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { MetadataRow } from "../metadata-row";
import { PickerHeader } from "../picker-header";

const UniCheck = withUniwind(Check);

type Props = {
  pin: EditablePin;
  authorFilter: EpicleseAuthorResponse | null;
  onPickAuthorFilter: () => void;
  onSelect: (item: EpicleseItemResponse) => void;
  onCreateNew: () => void;
  onDelete: () => void;
  onBack: () => void;
};

export const ItemSearchStep = ({
  pin,
  authorFilter,
  onPickAuthorFilter,
  onSelect,
  onCreateNew,
  onDelete,
  onBack,
}: Props) => {
  const client = useAtomValue(clientAtom);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const authorId = authorFilter?.id;

  const fetchItems = useCallback(
    async (q: string) => {
      const { data } = await client.epiclese.v1.items.get({
        query: authorId ? { q, author: authorId } : { q },
        throwOnError: true,
      });
      return data.items;
    },
    [client, authorId],
  );
  const { results, isLoading, isError, retry } = useDebouncedSearch(query, fetchItems);

  return (
    <>
      <PickerHeader title="アイテムを選択" left={{ label: "戻る", onPress: onBack }} />
      <View className="gap-3 py-3">
        <MetadataRow label="作者で絞り込む" value={authorFilter?.name ?? "すべての作者"} onPress={onPickAuthorFilter} />
        <View className="px-4">
          <CatalystSearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="アイテム名で検索"
            autoCorrect={false}
          />
        </View>
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
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          // 末尾の行がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator className="py-8" colorClassName="accent-light-tint dark:accent-dark-tint" />
            ) : (
              <CatalystText tone="muted" className="px-6 py-8 text-center">
                該当するアイテムが見つかりません
              </CatalystText>
            )
          }
          ListFooterComponent={
            <View className="gap-1 px-4 py-3">
              <Pressable onPress={onCreateNew} className="py-2">
                <CatalystText tone="tint">新しいアイテムを作成</CatalystText>
              </Pressable>
              <Pressable onPress={onDelete} className="py-2">
                <CatalystText tone="danger">ピンを削除</CatalystText>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = item.id === pin.reference;

            return (
              <CatalystListItem
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="px-4"
              >
                <View className="min-w-0 flex-1">
                  <CatalystText variant="label" numberOfLines={1}>
                    {item.author?.name ? `${item.name}（${item.author.name}）` : item.name}
                  </CatalystText>
                  <CatalystText variant="caption" tone="muted">
                    {ITEM_TYPE_LABELS[item.type]}
                  </CatalystText>
                </View>
                {isSelected && <UniCheck size={20} className="text-light-tint dark:text-dark-tint" />}
              </CatalystListItem>
            );
          }}
        />
      )}
    </>
  );
};
