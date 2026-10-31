import {
  CatalystBadge,
  CatalystBadgeText,
  CatalystEmptyState,
  CatalystSkeleton,
  CatalystText,
} from "@/components/design-system";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { useDeviceLayout, widthClassFor } from "@/lib/device-layout";
import { cn } from "@/lib/utils";
import { clientAtom } from "@/models/atoms/credential";
import { EPICLESE_ITEM_TYPE_LABELS, type EpicleseItemType } from "@/models/epiclese";
import type { EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { FlashList, FlashListRef, ListRenderItem } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { ListFilter, Package, SearchX } from "lucide-react-native";
import { memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";
import { getItemTypeLabel, ItemTypeSheet, type ItemTypeSheetRef } from "./type-sheet";

const UniImage = withUniwind(Image);
const UniPackageIcon = withUniwind(Package);
const UniSearchXIcon = withUniwind(SearchX);
const UniListFilterIcon = withUniwind(ListFilter);

type TimelineHandle = {
  scrollToTop: () => void;
};

type ItemWithCount = {
  item: EpicleseItemResponse;
  statusCount: number;
};

const ItemCard = memo(({ item, statusCount }: ItemWithCount) => {
  const router = useRouter();

  return (
    <Pressable
      className="m-1.5 flex-1 overflow-hidden rounded-xl border border-light-divider bg-light-surface active:opacity-80 dark:border-dark-divider dark:bg-dark-surface"
      onPress={() => router.push(`/items/${item.id}`)}
    >
      <View className="aspect-square items-center justify-center bg-light-surface-muted dark:bg-dark-surface-muted">
        {item.imageUrl ? (
          <UniImage source={{ uri: item.imageUrl }} className="size-full" contentFit="cover" />
        ) : (
          <UniPackageIcon size={32} className="text-light-icon dark:text-dark-icon" />
        )}
      </View>
      <View className="gap-1.5 p-3">
        <CatalystBadge className="self-start">
          <CatalystBadgeText>{EPICLESE_ITEM_TYPE_LABELS[item.type]}</CatalystBadgeText>
        </CatalystBadge>
        <CatalystText variant="label" numberOfLines={2}>
          {item.name}
        </CatalystText>
        <CatalystText variant="caption" tone="muted" numberOfLines={1}>
          by {item.author.name}
        </CatalystText>
        <CatalystText variant="caption" tone="muted">
          {statusCount} 件の投稿
        </CatalystText>
      </View>
    </Pressable>
  );
});
ItemCard.displayName = "ItemCard";

const ItemListPlaceholder = () => {
  const { mediaColumns } = useDeviceLayout();
  return (
    <View accessibilityLabel="アイテムを読み込み中" accessibilityRole="progressbar" className="flex-row flex-wrap px-1.5">
      {/* 読み込み後の一覧と同じ列数にする */}
      {Array.from({ length: mediaColumns * 2 }, (_, index) => (
        <View key={index} className={cn(widthClassFor(mediaColumns), "p-1.5")}>
          <CatalystSkeleton className="aspect-square w-full rounded-xl" />
          <View className="gap-1.5 pt-2">
            <CatalystSkeleton className="h-5 w-16 rounded-full" />
            <CatalystSkeleton className="h-4 w-4/5 rounded-full" />
            <CatalystSkeleton className="h-3 w-3/5 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
};

const ItemsEmptyResult = () => {
  return (
    <CatalystEmptyState
      icon={<UniSearchXIcon />}
      title="アイテムが見つかりません"
      description="別のキーワードや種類で検索してみてください"
    />
  );
};

type Props = {
  query?: string;
  ref?: React.Ref<TimelineHandle>;
};

export const ItemList = ({ query, ref }: Props) => {
  const client = useAtomValue(clientAtom);
  const { mediaColumns } = useDeviceLayout();
  const [type, setType] = useState<EpicleseItemType | null>(null);
  const [items, setItems] = useState<ItemWithCount[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadingMore = useRef(false);
  // 条件を変えたら番号を進め、前の条件のリクエストが後から返ってきても結果を捨てる
  const requestId = useRef(0);
  const list = useRef<FlashListRef<ItemWithCount>>(null);

  const typeSheet = useRef<ItemTypeSheetRef>(null);

  const fetchItems = useCallback(
    async (offset?: number) => {
      if (!client) return null;

      const { data } = await client.catalyst.v1.item.search.get({
        query: { q: query || undefined, type: type ?? undefined, offset },
        throwOnError: true,
      });
      return data;
    },
    [client, query, type],
  );

  useAsyncEffect(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setItems([]);
    setNextOffset(null);
    try {
      const data = await fetchItems();
      if (data && id === requestId.current) {
        setItems(data.items);
        setNextOffset(data.nextOffset);
      }
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [fetchItems]);

  const onLoadMore = useCallback(async () => {
    if (nextOffset === null || isLoadingMore.current) return;

    const id = requestId.current;
    isLoadingMore.current = true;
    try {
      const data = await fetchItems(nextOffset);
      if (data && id === requestId.current) {
        // 投稿数の順位がページの間で入れ替わると同じアイテムが次のページにも来るので、重複を除く
        setItems((prev) => [...prev, ...data.items.filter((w) => !prev.some((v) => v.item.id === w.item.id))]);
        setNextOffset(data.nextOffset);
      }
    } catch (e) {
      // 失敗しても一覧はそのまま残し、次にスクロールしたときにまた試す
      console.error(e);
    } finally {
      isLoadingMore.current = false;
    }
  }, [fetchItems, nextOffset]);

  const onRender = useCallback<ListRenderItem<ItemWithCount>>(({ item }) => {
    return <ItemCard item={item.item} statusCount={item.statusCount} />;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        list.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }),
    [],
  );

  const ListHeaderComponent = (
    <View className="gap-1 px-1.5 pt-4 pb-1.5">
      <View className="flex-row items-center justify-between gap-3">
        <CatalystText variant="title" className="shrink">
          よく使われているアイテム
        </CatalystText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`種類で絞り込む: ${getItemTypeLabel(type)}`}
          onPress={() => typeSheet.current?.open()}
          className="h-8 flex-row items-center gap-1.5 rounded-full border border-light-divider bg-light-surface pr-3 pl-2.5 active:opacity-80 dark:border-dark-divider dark:bg-dark-surface"
        >
          <UniListFilterIcon size={16} className="text-light-icon dark:text-dark-icon" />
          <CatalystText>{getItemTypeLabel(type)}</CatalystText>
        </Pressable>
      </View>
      <CatalystText tone="muted">アバターや衣装の名前・ショップ名から、そのアイテムを使った写真を探せます。</CatalystText>
    </View>
  );

  return (
    <>
      <FlashList
        ref={list}
        numColumns={mediaColumns}
        data={items}
        keyExtractor={(w) => w.item.id}
        renderItem={onRender}
        // FlashList は contentContainerClassName を解釈しないので、カードの余白 (m-1.5) と合わせて端を 12px にする
        contentContainerStyle={{ paddingHorizontal: 6 }}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={isLoading ? ItemListPlaceholder : ItemsEmptyResult}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.75}
        // 種類を切り替えると一覧を丸ごと入れ替える。既定のままだと、前の一覧で見えていたアイテムを
        // 新しい一覧でも見え続けさせようとして、途中まで勝手にスクロールしてしまう
        maintainVisibleContentPosition={{ disabled: true }}
      />
      <ItemTypeSheet ref={typeSheet} selected={type} onSelect={setType} />
    </>
  );
};
