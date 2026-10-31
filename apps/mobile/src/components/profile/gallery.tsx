import { useDeviceLayout } from "@/lib/device-layout";
import { useAsyncOneTimeEffect } from "@/hooks/use-async-one-time-effect";
import { getCdnUrl } from "@/lib/media";
import { merge } from "@/lib/merge";
import { clientAtom } from "@/models/atoms/credential";
import { CatalystStatus, EgeriaUser } from "@/models/sdk-types";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import React, { memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View, useWindowDimensions } from "react-native";
import { ProfileGalleryPlaceholder } from "./placeholder";

const GAP = 2;

type Props = {
  user: EgeriaUser;
};

export type UserGalleryHandle = {
  loadMore: () => void;
};

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
            <ActivityIndicator colorClassName="accent-light-tint dark:accent-dark-tint" />
          </View>
        )}
      </View>
    </Pressable>
  );
});
GalleryCell.displayName = "GalleryCell";

function distributeToColumns(items: CatalystStatus[], columnCount: number, columnWidth: number): CatalystStatus[][] {
  const columns: CatalystStatus[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array<number>(columnCount).fill(0);

  for (const item of items) {
    const media = item.medias[0];
    if (!media) continue;

    const aspectRatio =
      media.metadata?.width && media.metadata?.height ? media.metadata.width / media.metadata.height : 1;
    const cellHeight = columnWidth / aspectRatio;

    const shorter = heights.indexOf(Math.min(...heights));
    columns[shorter].push(item);
    heights[shorter] += cellHeight + GAP;
  }

  return columns;
}

export const UserGallery = memo(
  React.forwardRef<UserGalleryHandle, Props>(({ user }, ref) => {
    const client = useAtomValue(clientAtom);
    const { width: screenWidth } = useWindowDimensions();
    const { mediaColumns: columnCount } = useDeviceLayout();
    const columnWidth = (screenWidth - GAP * (columnCount - 1)) / columnCount;
    const [items, setItems] = useState<CatalystStatus[]>([]);
    const sets = useRef<Set<string>>(new Set());
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const isLoadingRef = useRef(false);

    const fetchItems = useCallback(async () => {
      if (!user) {
        setIsInitialLoading(false);
        return;
      }

      setIsInitialLoading(true);
      isLoadingRef.current = true;
      try {
        const { data } = await client.catalyst.v1.timeline.user.by.username.username.gallery.get({
          path: { username: user.screenName },
          query: {},
          throwOnError: true,
        });
        setItems((prev) => merge(prev, data.statuses, sets, (item) => item.id));
      } finally {
        setIsInitialLoading(false);
        isLoadingRef.current = false;
      }
    }, [client, user]);

    const loadMore = useCallback(async () => {
      if (!user || isLoadingRef.current || isInitialLoading) return;

      const lastItem = items[items.length - 1];
      if (!lastItem) return;

      setIsLoadingMore(true);
      isLoadingRef.current = true;
      try {
        const { data } = await client.catalyst.v1.timeline.user.by.username.username.gallery.get({
          path: { username: user.screenName },
          query: { until: lastItem.id },
          throwOnError: true,
        });
        if (data.statuses.length > 0) {
          setItems((prev) => merge(prev, data.statuses, sets, (item) => item.id));
        }
      } finally {
        setIsLoadingMore(false);
        isLoadingRef.current = false;
      }
    }, [user, items, client, isInitialLoading]);

    useImperativeHandle(ref, () => ({ loadMore }), [loadMore]);

    useAsyncOneTimeEffect(fetchItems);

    if (isInitialLoading && items.length === 0) {
      return <ProfileGalleryPlaceholder />;
    }

    const columns = distributeToColumns(items, columnCount, columnWidth);

    return (
      <View>
        <View className="flex-row" style={{ gap: GAP }}>
          {columns.map((column, index) => (
            <View key={index} style={{ width: columnWidth }}>
              {column.map((item) => (
                <GalleryCell key={item.id} status={item} columnWidth={columnWidth} />
              ))}
            </View>
          ))}
        </View>
        {isLoadingMore && (
          <View className="py-4">
            <ActivityIndicator colorClassName="accent-light-tint dark:accent-dark-tint" />
          </View>
        )}
      </View>
    );
  }),
);
UserGallery.displayName = "UserGallery";
