import { useDeviceLayout } from "@/lib/device-layout";
import { AlbumCard } from "@/components/album/card";
import { ProfileAlbumsPlaceholder } from "@/components/profile/placeholder";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { clientAtom } from "@/models/atoms/credential";
import type { CatalystAlbumOrSmartAlbum } from "@/models/sdk-types";
import { FlashList, FlashListRef, ListRenderItem } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { useCallback, useImperativeHandle, useRef, useState } from "react";
import { AlbumsEmptyResult } from "./empty-result";

// サーバーは 1 回に最大 20 件返す。20 件未満ならそれ以上は無い (Web 版と同じ判定)
const PAGE_SIZE = 20;

type TimelineHandle = {
  scrollToTop: () => void;
};

type Props = {
  query: string;
  ref?: React.Ref<TimelineHandle>;
};

export const AlbumList = ({ query, ref }: Props) => {
  const client = useAtomValue(clientAtom);
  const { listColumns } = useDeviceLayout();
  const [albums, setAlbums] = useState<CatalystAlbumOrSmartAlbum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const isLoadingMore = useRef(false);
  // キーワードを変えたら番号を進め、前のキーワードのリクエストが後から返ってきても結果を捨てる
  const requestId = useRef(0);
  const list = useRef<FlashListRef<CatalystAlbumOrSmartAlbum>>(null);

  const onRender = useCallback<ListRenderItem<CatalystAlbumOrSmartAlbum>>(({ item }) => {
    return <AlbumCard album={item} />;
  }, []);

  // キーワードが空のときは公開アルバムの一覧になる
  const fetchAlbums = useCallback(
    async (until?: string) => {
      if (!client) return null;

      const { data } = await client.catalyst.v1.album.search.get({
        query: { q: query || undefined, include_smart_album: true, until },
        throwOnError: true,
      });
      return data.albums;
    },
    [client, query],
  );

  useAsyncEffect(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setAlbums([]);
    setHasMore(false);
    try {
      const results = await fetchAlbums();
      if (results && id === requestId.current) {
        setAlbums(results);
        setHasMore(results.length >= PAGE_SIZE);
      }
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [fetchAlbums]);

  const onLoadMore = useCallback(async () => {
    const last = albums.at(-1);
    if (!hasMore || !last || isLoadingMore.current) return;

    const id = requestId.current;
    isLoadingMore.current = true;
    try {
      const results = await fetchAlbums(last.id);
      if (results && id === requestId.current) {
        setAlbums((prev) => [...prev, ...results.filter((w) => !prev.some((v) => v.id === w.id))]);
        setHasMore(results.length >= PAGE_SIZE);
      }
    } catch (e) {
      // 失敗しても一覧はそのまま残し、次にスクロールしたときにまた試す
      console.error(e);
    } finally {
      isLoadingMore.current = false;
    }
  }, [albums, fetchAlbums, hasMore]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        list.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }),
    [],
  );

  return (
    <FlashList
      numColumns={listColumns}
      ref={list}
      data={albums}
      keyExtractor={(w) => w.id}
      renderItem={onRender}
      ListEmptyComponent={isLoading ? ProfileAlbumsPlaceholder : <AlbumsEmptyResult query={query} />}
      ListEmptyComponentStyle={{ minHeight: "80%" }}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.75}
    />
  );
};
