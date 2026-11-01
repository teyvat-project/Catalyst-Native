import { CatalystSurface, CatalystText } from "@/components/design-system";
import type { WorldSite } from "@/lib/world-site";
import { openUrlWithBrowser } from "@/models/browser-settings";
import { Image } from "expo-image";
import { ExternalLink, Globe } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);
const UniExternalLink = withUniwind(ExternalLink);
const UniGlobe = withUniwind(Globe);

type Props = {
  name: string;
  site: WorldSite;
};

/**
 * `platform:VRChat world:"..."` などの検索結果の先頭に出すワールドカード。
 * Web 版 (WorldCard) に合わせ、サムネイルと作成者は miliastra から取って載せる。
 * ワールド名は Epiclese のものをそのまま出すので、miliastra の応答を待たずに表示できる。
 * サムネイルは読み込めなかったら地球儀に、作成者は取れなかったら空行にする。
 */
export const SearchWorldCard = ({ name, site }: Props) => {
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [isThumbnailBroken, setIsThumbnailBroken] = useState(false);

  useEffect(() => {
    site.fetchAuthorName().then(setAuthorName);
  }, [site]);

  return (
    <View className="border-b border-light-divider bg-light-background p-3 dark:border-dark-divider dark:bg-dark-background">
      <CatalystSurface radius="lg" className="overflow-hidden border border-light-divider dark:border-dark-divider">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${name} を ${site.platformName} 公式サイトで開く`}
          className="flex-row active:opacity-75"
          onPress={() => openUrlWithBrowser(site.url)}
        >
          {/* 読み込みの前後でカードがずれないよう、サムネイルの枠は最初から確保しておく。
              幅を高さから決めると、文字の折り返しと幅が互いに影響して最後の行がはみ出すので幅は固定にする */}
          <View className="w-36 items-center justify-center self-stretch bg-light-surface-muted dark:bg-dark-surface-muted">
            {isThumbnailBroken ? (
              <UniGlobe size={24} className="text-light-text-subtle dark:text-dark-text-subtle" />
            ) : (
              <UniImage
                source={site.thumbnailUrl}
                contentFit="cover"
                className="absolute inset-0"
                onError={() => setIsThumbnailBroken(true)}
              />
            )}
          </View>
          <View className="min-w-0 flex-1 gap-1.5 px-3 py-2.5">
            <View className="flex-row items-center gap-1.5">
              <UniGlobe size={14} className="text-light-text-muted dark:text-dark-text-muted" />
              <CatalystText variant="mono" tone="muted" className="text-[11px] font-medium tracking-wide uppercase">
                {site.platformName} ワールド
              </CatalystText>
            </View>
            <View>
              <CatalystText variant="subtitle" numberOfLines={2}>
                {name}
              </CatalystText>
              {/* 制作者が届いてから行が増えないよう、取得中も 1 行分の高さを取っておく */}
              <CatalystText variant="caption" tone="muted" numberOfLines={1}>
                {authorName ? `作成者: ${authorName}` : " "}
              </CatalystText>
            </View>
            <View className="flex-row items-center justify-between gap-2">
              <CatalystText variant="caption" className="font-medium">
                {site.platformName} 公式サイトで開く
              </CatalystText>
              <UniExternalLink size={14} className="text-light-text-muted dark:text-dark-text-muted" />
            </View>
          </View>
        </Pressable>
      </CatalystSurface>
    </View>
  );
};
