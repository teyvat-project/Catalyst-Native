import { useDeviceLayout } from "@/lib/device-layout";
import { useAsyncOneTimeEffect } from "@/hooks/use-async-one-time-effect";
import { MediaBadges } from "@/components/ui/media-badges";
import { getCdnUrl } from "@/lib/media";
import { merge } from "@/lib/merge";
import { clientAtom } from "@/models/atoms/credential";
import { CatalystStatus, EgeriaUser } from "@/models/sdk-types";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { MessageSquare } from "lucide-react-native";
import React, { memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from "react-native";
import { ProfileTimelinePlaceholder } from "./placeholder";

const GAP = 1;

type Props = {
  user?: EgeriaUser | null;
};

export type UserTimelineHandle = {
  loadMore: () => void;
  refresh?: () => Promise<void>;
};

const ThumbnailCell = memo(({ status, cellSize }: { status: CatalystStatus; cellSize: number }) => {
  const router = useRouter();
  const media = status.medias[0];
  const [isImageLoading, setIsImageLoading] = useState(true);
  const isSensitive = status.medias.some((w) => w.metadata?.isSensitive);
  const isSpoiler = status.medias.some((w) => w.metadata?.isSpoiler);

  return (
    <Pressable onPress={() => router.push(`/status/${status.id}`)} style={{ width: cellSize, height: cellSize }}>
      {media ? (
        <View style={{ width: cellSize, height: cellSize }}>
          <View className="relative">
            <Image
              source={{
                uri: getCdnUrl({
                  src: media.url,
                  variant: "tiny",
                  width: cellSize,
                }),
              }}
              style={{ width: cellSize, height: cellSize }}
              contentFit="cover"
              onLoadEnd={() => setIsImageLoading(false)}
            />
            {isSensitive && (
              <View className="absolute inset-0 flex items-center justify-center  bg-light-skeleton dark:bg-dark-skeleton">
                <Text className="text-light-text dark:text-dark-text">Sensitive Content</Text>
              </View>
            )}
            {isSpoiler && (
              <View className="absolute inset-0 flex items-center justify-center bg-light-skeleton dark:bg-dark-skeleton">
                <Text className="text-light-text dark:text-dark-text">Spoiler Content</Text>
              </View>
            )}
          </View>
          {/* タイムラインのカルーセルと同じく、センシティブ・ネタバレで覆っている間は目印を出さない。
              読み込み中の表示より前に置き、写真が出るまでは隠す */}
          {!isSensitive && !isSpoiler && (
            <MediaBadges
              compact
              hasReference={status.medias.some((m) => m.hasReference)}
              hasMultiple={status.medias.length > 1}
            />
          )}
          {isImageLoading && (
            <View className="absolute inset-0 items-center justify-center bg-light-skeleton dark:bg-dark-skeleton">
              <ActivityIndicator colorClassName="accent-light-tint dark:accent-dark-tint" />
            </View>
          )}
        </View>
      ) : (
        <View className="flex-1 items-center justify-center bg-gray-200 dark:bg-gray-800">
          <MessageSquare size={24} color="#9CA3AF" />
        </View>
      )}
    </Pressable>
  );
});
ThumbnailCell.displayName = "ThumbnailCell";

export const UserTimeline = memo(
  React.forwardRef<UserTimelineHandle, Props>(({ user }, ref) => {
    const client = useAtomValue(clientAtom);
    const { width: screenWidth } = useWindowDimensions();
    const { postColumns: columns } = useDeviceLayout();
    const cellSize = (screenWidth - GAP * (columns - 1)) / columns;
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
        const { data } = await client.catalyst.v1.timeline.user.by.username.username.get({
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
      if (!user || isLoadingRef.current || isInitialLoading) {
        return;
      }

      const lastItem = items[items.length - 1];
      if (!lastItem) return;

      setIsLoadingMore(true);
      isLoadingRef.current = true;
      try {
        const { data } = await client.catalyst.v1.timeline.user.by.username.username.get({
          path: { username: user.screenName },
          query: { until: lastItem.id },
          throwOnError: true,
        });

        setItems((prev) => merge(prev, data.statuses, sets, (item) => item.id));
      } finally {
        setIsLoadingMore(false);
        isLoadingRef.current = false;
      }
    }, [user, items, client, isInitialLoading]);

    const refresh = useCallback(async () => {
      if (!user || isLoadingRef.current) {
        return;
      }

      isLoadingRef.current = true;
      try {
        const { data } = await client.catalyst.v1.timeline.user.by.username.username.get({
          path: { username: user.screenName },
          query: {},
          throwOnError: true,
        });
        sets.current = new Set(data.statuses.map((item) => item.id));
        setItems(data.statuses);
      } finally {
        isLoadingRef.current = false;
      }
    }, [client, user]);

    useImperativeHandle(ref, () => ({ loadMore, refresh }), [loadMore, refresh]);

    useAsyncOneTimeEffect(fetchItems);

    const rows: CatalystStatus[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      rows.push(items.slice(i, i + columns));
    }

    if (isInitialLoading && items.length === 0) {
      return <ProfileTimelinePlaceholder />;
    }

    return (
      <View>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row" style={{ marginTop: rowIndex > 0 ? GAP : 0 }}>
            {row.map((item, colIndex) => (
              <View key={item.id} style={{ marginLeft: colIndex > 0 ? GAP : 0 }}>
                <ThumbnailCell status={item} cellSize={cellSize} />
              </View>
            ))}
          </View>
        ))}
        {isLoadingMore && (
          <View className="py-4">
            <ActivityIndicator colorClassName="accent-light-tint dark:accent-dark-tint" />
          </View>
        )}
      </View>
    );
  }),
);
UserTimeline.displayName = "UserTimeline";
