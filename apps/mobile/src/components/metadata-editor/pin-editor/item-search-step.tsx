import { CatalystListItem, CatalystSearchField, CatalystText } from "@/components/design-system";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { clientAtom } from "@/models/atoms/credential";
import { ITEM_TYPE_LABELS, type EditablePin } from "@/models/epiclese-pin-editor";
import { forgetRecentItem, loadRecentItems, type RecentItem } from "@/models/epiclese-recent-items";
import type { EpicleseAuthorResponse, EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MetadataRow } from "../metadata-row";
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
  const { results, resultsQuery, isLoading, isError, retry } = useDebouncedSearch(query, fetchItems);

  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  useEffect(() => {
    loadRecentItems().then(setRecentItems);
  }, []);

  // 検索欄が空のときは、最近使ったアイテムを先頭に出し、検索結果からは除く。
  // 入力中の results は前の問い合わせの結果のままなので、出し分けは results の問い合わせに合わせる。
  // 名前などが変わっていることがあるので、検索結果にも入っていればそちらを使う
  const latest = new Map(results.map((item) => [item.id, item]));
  const shownRecentItems =
    resultsQuery?.trim() === ""
      ? recentItems
          .map((item) => latest.get(item.id) ?? item)
          .filter((item) => !authorId || item.author.id === authorId)
      : [];
  const recentIds = new Set(shownRecentItems.map((item) => item.id));
  const listItems = results.filter((item) => !recentIds.has(item.id));

  const forgetItem = (id: string) => {
    forgetRecentItem(id).catch(() => {});
    setRecentItems((prev) => prev.filter((recent) => recent.id !== id));
  };

  // 検索結果のアイテムはそのまま、最近使ったアイテムで検索結果に無いものは取り直してから選ぶ
  const { verifyingId, pick } = useRefetchOnPick({
    kind: "アイテム",
    fetch: async (id) => {
      const { data, response } = await client.epiclese.v1.items.id.get({ path: { id } });
      return { data: data?.item, response };
    },
    onGone: forgetItem,
  });
  const handleSelect = (item: RecentItem) => pick(item.id, latest.get(item.id), onSelect);

  const renderItem = (item: RecentItem, isRecent: boolean) => {
    const isSelected = item.id === pin.reference;

    return (
      <CatalystListItem
        key={item.id}
        onPress={() => void handleSelect(item)}
        {...(isRecent &&
          item.id !== verifyingId &&
          forgetOnLongPress({ name: item.name, section: "最近使ったアイテム", onForget: () => forgetItem(item.id) }))}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        divided={false}
        className={`px-4 ${PICK_ROW_CLASS}`}
      >
        {/* 名前が長くても作者名が押し出されないよう、作者名はカテゴリと同じ行に出す */}
        <View className="min-w-0 flex-1">
          <CatalystText variant="label" numberOfLines={2}>
            {item.name}
          </CatalystText>
          <CatalystText variant="caption" tone="muted" numberOfLines={1}>
            {item.author?.name
              ? `${ITEM_TYPE_LABELS[item.type]} · by ${item.author.name}`
              : ITEM_TYPE_LABELS[item.type]}
          </CatalystText>
        </View>
        <PickTrailing verifying={item.id === verifyingId} selected={isSelected} />
      </CatalystListItem>
    );
  };

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
          data={listItems}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          // 末尾の行がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る
          className={PICK_LIST_CLASS}
          ItemSeparatorComponent={PickSeparator}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          ListHeaderComponent={
            shownRecentItems.length > 0 ? (
              <View>
                <SectionLabel first>最近使ったアイテム</SectionLabel>
                <PickGroup>{shownRecentItems.map((item) => renderItem(item, true))}</PickGroup>
                {(isLoading || listItems.length > 0) && <SectionLabel>アイテム一覧</SectionLabel>}
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator className="py-8" colorClassName="accent-light-tint dark:accent-dark-tint" />
            ) : shownRecentItems.length > 0 ? undefined : (
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
          renderItem={({ item }) => renderItem(item, false)}
        />
      )}
    </>
  );
};
