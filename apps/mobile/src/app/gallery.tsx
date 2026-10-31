import { useDeviceLayout } from "@/lib/device-layout";
import { ProfileGalleryPlaceholder } from "@/components/profile/placeholder";
import { useAsyncOneTimeEffect } from "@/hooks/use-async-one-time-effect";
import { getCdnUrl } from "@/lib/media";
import { merge } from "@/lib/merge";
import { clientAtom } from "@/models/atoms/credential";
import type { CatalystStatus } from "@/models/sdk-types";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import React, { memo, useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, View, useWindowDimensions } from "react-native";

const GAP = 2;

const GalleryCell = memo(({ status, columnWidth }: { status: CatalystStatus; columnWidth: number }) => {
  const router = useRouter();
  const media = status.medias[0];
  const [isImageLoading, setIsImageLoading] = useState(true);
  if (!media) return null;

  const aspectRatio =
    media.metadata?.width && media.metadata?.height ? media.metadata.width / media.metadata.height : 1;
  const cellHeight = columnWidth / aspectRatio;
  const [realId] = status.id.split("/");

  return (
    <Pressable onPress={() => router.push(`/status/${realId}`)} style={{ marginBottom: GAP }}>
      <View style={{ width: columnWidth, height: cellHeight, borderRadius: 4, overflow: "hidden" }}>
        <Image
          source={{
            uri: getCdnUrl({
              src: media.url,
              variant: "xsmall",
              width: columnWidth,
            }),
          }}
          style={{ width: columnWidth, height: cellHeight }}
          contentFit="cover"
          onLoadEnd={() => setIsImageLoading(false)}
        />
        {isImageLoading && (
          <View className="absolute inset-0 items-center justify-center bg-light-skeleton dark:bg-dark-skeleton">
            <ActivityIndicator />
          </View>
        )}
      </View>
    </Pressable>
  );
});
GalleryCell.displayName = "GalleryCell";

export default function GalleryScreen() {
  const client = useAtomValue(clientAtom);
  const { width: screenWidth } = useWindowDimensions();
  const { mediaColumns: columns } = useDeviceLayout();
  const columnWidth = (screenWidth - GAP * (columns - 1)) / columns;
  const [items, setItems] = useState<CatalystStatus[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isLoadingRef = useRef(false);
  const sets = useRef<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setIsInitialLoading(true);
    isLoadingRef.current = true;
    try {
      const { data } = await client.catalyst.v1.timeline.gallery.get({
        query: {},
        throwOnError: true,
      });
      setItems((prev) => merge(prev, data.statuses, sets, (item) => item.id));
    } finally {
      setIsInitialLoading(false);
      isLoadingRef.current = false;
    }
  }, [client]);

  const onRefresh = useCallback(async () => {
    if (isLoadingRef.current) return;

    setIsRefreshing(true);
    isLoadingRef.current = true;

    try {
      const since = items.length > 0 ? items[0].id : null;
      const { data } = await client.catalyst.v1.timeline.gallery.get({
        query: { since: since || undefined },
        throwOnError: true,
      });
      const newItems = data.statuses;

      if (newItems.length > 0) {
        setItems((prev) => merge(prev, newItems, sets, (item) => item.id));
      }
    } finally {
      setIsRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [items, client]);

  const onLoadMore = useCallback(async () => {
    if (isLoadingRef.current || isInitialLoading) return;

    const lastItem = items[items.length - 1];
    if (!lastItem) return;

    setIsLoadingMore(true);
    isLoadingRef.current = true;
    try {
      const { data } = await client.catalyst.v1.timeline.gallery.get({
        query: { until: lastItem.id },
        throwOnError: true,
      });
      const result = data.statuses;
      if (result.length > 0) {
        setItems((prev) => merge(prev, result, sets, (item) => item.id));
      }
    } finally {
      setIsLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [items, client, isInitialLoading]);

  useAsyncOneTimeEffect(fetchItems);

  return (
    <View className="flex-1 bg-light-background dark:bg-dark-background">
      <FlashList
        data={items}
        keyExtractor={(w) => w.id}
        renderItem={({ item }) => <GalleryCell key={item.id} status={item} columnWidth={columnWidth} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        numColumns={columns}
        masonry
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.75}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator className="py-4" /> : null}
        ListEmptyComponent={isInitialLoading ? ProfileGalleryPlaceholder : undefined}
      />
    </View>
  );
}
