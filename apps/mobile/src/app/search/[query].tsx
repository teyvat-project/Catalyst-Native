import { SearchWorldCard } from "@/components/search/world-card";
import { TimelineBase } from "@/components/timeline/base";
import { extractSearchQualifier } from "@/lib/search-query";
import { getWorldSite } from "@/lib/world-site";
import { clientAtom } from "@/models/atoms/credential";
import type { EpicleseWorldResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { Stack, useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

// expo-router の時点でデコード済みのことがあり、「100%」のように % を含む語をもう一度デコードすると例外になる。
// そのときはデコード済みとみなしてそのまま使う
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export default function SearchPage() {
  const params = useLocalSearchParams<{ query: string }>();
  const client = useAtomValue(clientAtom);
  const hashtag = safeDecode(params.query ?? "");
  const [world, setWorld] = useState<EpicleseWorldResponse | null>(null);
  const fetcher = useCallback(
    async (since: string | null, until: string | null) => {
      if (!client || !hashtag) {
        return [];
      }

      const { data } = await client.catalyst.v1.timeline.search.get({
        query: {
          q: hashtag,
          exact: true,
          since: since ?? undefined,
          until: until ?? undefined,
        },
        throwOnError: true,
      });
      return data.statuses;
    },
    [client, hashtag],
  );

  // `platform:VRChat world:"Chill Space"` のようなクエリのときは、
  // 検索結果の先頭にワールドの情報と公式サイトへの導線を出す
  useEffect(() => {
    const platform = extractSearchQualifier(hashtag, "platform");
    const name = extractSearchQualifier(hashtag, "world");

    // 検索語が変わったら、前のワールドのカードを残さない
    setWorld(null);
    if (!client || !platform || !name) {
      return;
    }

    client.epiclese.v1.worlds.resolve
      .get({ query: { platform, name }, throwOnError: true })
      .then(({ data }) => setWorld(data.world))
      .catch(() => {});
  }, [client, hashtag]);

  // 公式サイトの URL を組み立てられるのは今のところ VRChat と XRift のワールドだけ
  const site = useMemo(() => world && getWorldSite(world.platform?.name, world.platformIdentifier), [world]);
  const ListHeaderComponent = useCallback(
    () => (world && site ? <SearchWorldCard name={world.name} site={site} /> : null),
    [world, site],
  );

  return (
    <>
      <Stack.Screen options={{ title: hashtag }} />
      <TimelineBase fetcher={fetcher} ListHeaderComponent={ListHeaderComponent} />
    </>
  );
}
