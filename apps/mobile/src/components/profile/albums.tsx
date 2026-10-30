import { useDeviceLayout } from "@/lib/device-layout";
import { AlbumCard } from "@/components/album/card";
import { CatalystEmptyState } from "@/components/design-system";
import { useAsyncOneTimeEffect } from "@/hooks/use-async-one-time-effect";
import { clientAtom } from "@/models/atoms/credential";
import { CatalystAlbumOrSmartAlbum, EgeriaUser } from "@/models/sdk-types";
import { FlashList, ListRenderItem } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { Images } from "lucide-react-native";
import { useCallback, useState } from "react";
import { withUniwind } from "uniwind";
import { ProfileAlbumsPlaceholder } from "./placeholder";

import "@/global.css";

const UniImages = withUniwind(Images);

const AlbumsEmpty = () => (
  <CatalystEmptyState title="アルバムはまだありません" icon={<UniImages />} className="min-h-96" />
);

type Props = {
  user: EgeriaUser;
};

export const UserAlbums = ({ user }: Props) => {
  const client = useAtomValue(clientAtom);
  const { listColumns } = useDeviceLayout();
  const [albums, setAlbums] = useState<CatalystAlbumOrSmartAlbum[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const fetchAlbums = useCallback(async () => {
    if (!client) {
      setIsInitialLoading(false);
      return;
    }

    setIsInitialLoading(true);
    try {
      const { data } = await client.catalyst.v1.album.by.user.username.get({
        path: { username: user.screenName },
        query: { include_smart_albums: true },
        throwOnError: true,
      });
      setAlbums(data.albums);
    } finally {
      setIsInitialLoading(false);
    }
  }, [client, user]);

  useAsyncOneTimeEffect(fetchAlbums);

  const onRender = useCallback<ListRenderItem<CatalystAlbumOrSmartAlbum>>(({ item }) => {
    return <AlbumCard album={item} />;
  }, []);

  if (isInitialLoading && albums.length === 0) {
    return <ProfileAlbumsPlaceholder />;
  }

  return (
    <FlashList
      numColumns={listColumns}
      data={albums}
      keyExtractor={(w) => w.id}
      renderItem={onRender}
      ListEmptyComponent={AlbumsEmpty}
      ListEmptyComponentStyle={{ minHeight: "100%" }}
    />
  );
};
