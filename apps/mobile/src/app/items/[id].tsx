import { AlbumVisualContent } from "@/components/album/detail-page";
import {
  CatalystAvatar,
  CatalystEmptyState,
  CatalystIconButton,
  CatalystSkeleton,
  CatalystSurface,
  CatalystText,
} from "@/components/design-system";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { getCdnUrl } from "@/lib/media";
import { buildShareText } from "@/lib/share";
import { clientAtom } from "@/models/atoms/credential";
import { openUrlWithBrowser } from "@/models/browser-settings";
import { EPICLESE_ITEM_TYPE_LABELS } from "@/models/epiclese";
import type { GetCatalystV1ItemsByIdResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { ExternalLink, Images, Package, PackageX, Share2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);
const UniPackageIcon = withUniwind(Package);
const UniExternalLinkIcon = withUniwind(ExternalLink);
const UniShareIcon = withUniwind(Share2);
const UniImagesIcon = withUniwind(Images);
const UniPackageXIcon = withUniwind(PackageX);

type ItemDetail = GetCatalystV1ItemsByIdResponse;

const getItemUrl = (id: string) => `https://catalyst.natsuneko.com/items/${id}`;

/**
 * アイテムの概要カード。検索結果のワールドカードと同じ作りで、カード全体が販売ページへのリンクになる。
 * 販売ページが無いアイテムは押せないカードにする
 */
const ItemCard = ({ detail }: { detail: ItemDetail }) => {
  const { item, statusCount } = detail;
  const shopUrl = item.externalUrl;

  return (
    <CatalystSurface radius="lg" className="overflow-hidden border border-light-divider dark:border-dark-divider">
      {/* 販売ページが無いアイテムは押せないカードにし、リンクとしても読み上げない */}
      <Pressable
        disabled={!shopUrl}
        accessibilityRole={shopUrl ? "link" : undefined}
        accessibilityLabel={shopUrl ? `${item.name} の販売ページを開く` : undefined}
        className="flex-row active:opacity-75"
        onPress={() => shopUrl && openUrlWithBrowser(shopUrl)}
      >
        {/* 文字の折り返しで高さが変わっても崩れないよう、画像の枠は幅だけ固定して高さはカードに合わせる */}
        <View className="w-32 items-center justify-center self-stretch bg-light-surface-muted dark:bg-dark-surface-muted">
          {item.imageUrl ? (
            <UniImage source={{ uri: item.imageUrl }} contentFit="cover" className="absolute inset-0" />
          ) : (
            <UniPackageIcon size={28} className="text-light-text-subtle dark:text-dark-text-subtle" />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1.5 px-3 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <UniPackageIcon size={14} className="text-light-text-muted dark:text-dark-text-muted" />
            <CatalystText variant="mono" tone="muted" className="text-[11px] font-medium tracking-wide">
              {EPICLESE_ITEM_TYPE_LABELS[item.type]}
            </CatalystText>
          </View>
          <View>
            <CatalystText variant="subtitle" numberOfLines={3}>
              {item.name}
            </CatalystText>
            <CatalystText variant="caption" tone="muted" numberOfLines={1}>
              by {item.author.name}
            </CatalystText>
          </View>
          <CatalystText variant="caption" tone="muted">
            {statusCount} 件の投稿
          </CatalystText>
          {shopUrl ? (
            <View className="flex-row items-center justify-between gap-2">
              <CatalystText variant="caption" className="font-medium">
                販売ページを見る
              </CatalystText>
              <UniExternalLinkIcon size={14} className="text-light-text-muted dark:text-dark-text-muted" />
            </View>
          ) : null}
        </View>
      </Pressable>
    </CatalystSurface>
  );
};

const ItemUsers = ({ users }: { users: ItemDetail["users"] }) => {
  const router = useRouter();
  if (users.length === 0) return null;

  return (
    <View className="gap-3">
      <CatalystText variant="subtitle">このアイテムを使っているユーザー</CatalystText>
      <View className="flex-row flex-wrap gap-2">
        {users.map((user) => (
          <Pressable
            key={user.id}
            accessibilityRole="link"
            onPress={() => router.push(`/user/${user.screenName}`)}
            className="max-w-full flex-row items-center gap-2 rounded-full border border-light-divider bg-light-surface py-1 pr-3 pl-1 active:opacity-75 dark:border-dark-divider dark:bg-dark-surface"
          >
            <CatalystAvatar
              size="sm"
              source={
                user.profile?.iconUrl
                  ? getCdnUrl({ src: user.profile.iconUrl, variant: "icon", width: 64 })
                  : undefined
              }
              fallback={user.displayName}
            />
            <CatalystText numberOfLines={1} className="shrink">
              {user.displayName}
            </CatalystText>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const ItemHeaderPlaceholder = () => (
  <View className="flex-row gap-3 rounded-xl border border-light-divider p-3 dark:border-dark-divider">
    <CatalystSkeleton className="size-24 rounded-lg" />
    <View className="flex-1 gap-2">
      <CatalystSkeleton className="h-3 w-16 rounded-full" />
      <CatalystSkeleton className="h-5 w-4/5 rounded-full" />
      <CatalystSkeleton className="h-3 w-3/5 rounded-full" />
    </View>
  </View>
);

export default function ItemPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useAtomValue(clientAtom);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  // 削除・非表示のアイテム (404) や通信エラーのときに、読み込み中の表示を出し続けないようにする
  useAsyncEffect(async () => {
    if (!client || !id) return;

    try {
      const { data } = await client.catalyst.v1.items.id.get({ path: { id }, throwOnError: true });
      setDetail(data);
    } catch (e) {
      console.error(e);
      setIsUnavailable(true);
    }
  }, [client, id]);

  const fetcher = useCallback(
    async (since: string | null, until: string | null) => {
      if (!client || !id) return [];

      const { data } = await client.catalyst.v1.timeline.item.by.id.id.get({
        path: { id },
        query: { since: since ?? undefined, until: until ?? undefined },
        throwOnError: true,
      });
      return data.statuses;
    },
    [client, id],
  );

  const share = useCallback(() => {
    if (!detail) return;

    const url = getItemUrl(detail.item.id);
    // iOS でも URL は本文に含める (投稿の共有と同じ)
    Share.share({ message: buildShareText(detail.item.name, detail.item.author.name, url) });
  }, [detail]);

  return (
    <View className="flex-1 bg-light-background dark:bg-dark-background">
      <Stack.Screen
        options={{
          title: detail?.item.name ?? "アイテム",
          headerRight: () =>
            detail ? (
              <CatalystIconButton label="共有" size="sm" tone="ghost" onPress={share}>
                <UniShareIcon className="text-light-tint dark:text-dark-tint" />
              </CatalystIconButton>
            ) : null,
        }}
      />
      {isUnavailable ? (
        <CatalystEmptyState
          icon={<UniPackageXIcon />}
          title="アイテムを表示できませんでした"
          description="削除されたか、通信に失敗した可能性があります。"
        />
      ) : (
        // 小物や衣装が切れないよう、写真は切り抜かずに並べるギャラリー表示にする
        <AlbumVisualContent
          mode="gallery"
          fetcher={fetcher}
          onlyReferencedMedia
          header={
            <View className="gap-5 px-3 pt-3 pb-3">
              {detail ? <ItemCard detail={detail} /> : <ItemHeaderPlaceholder />}
              {detail ? <ItemUsers users={detail.users} /> : null}
              <CatalystText variant="subtitle">このアイテムを使った写真</CatalystText>
            </View>
          }
          emptyState={<CatalystEmptyState icon={<UniImagesIcon />} title="まだ写真がありません" className="min-h-60" />}
        />
      )}
    </View>
  );
}
