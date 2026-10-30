import { useDeviceLayout } from "@/lib/device-layout";
import { ContestCard } from "@/components/contest/card";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { clientAtom } from "@/models/atoms/credential";
import type { CatalystContest } from "@/models/sdk-types";
import { FlashList, FlashListRef, ListRenderItem } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { useCallback, useImperativeHandle, useRef, useState } from "react";
import { ContestsEmptyResult } from "./empty-result";
import { ContestListPlaceholder } from "./skeleton";

type TimelineHandle = {
  scrollToTop: () => void;
};

type Props = {
  states: string[];
  query?: string;
  ref?: React.Ref<TimelineHandle>;
};

export const ContestList = ({ states, query, ref }: Props) => {
  const client = useAtomValue(clientAtom);
  const { listColumns } = useDeviceLayout();
  const [contests, setContests] = useState<CatalystContest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const list = useRef<FlashListRef<CatalystContest>>(null);

  const onRender = useCallback<ListRenderItem<CatalystContest>>(({ item }) => {
    return <ContestCard contest={item} />;
  }, []);

  useAsyncEffect(async () => {
    setIsLoading(true);
    setContests([]);
    try {
      if (client) {
        const results = await Promise.all(
          states.map((state) =>
            client.catalyst.v1.contest.search.get({
              query: {
                q: query || undefined,
                state: state as "draft" | "published" | "opening" | "closing" | "voting" | "electing" | "closed",
              },
              throwOnError: true,
            }),
          ),
        );
        setContests(results.flatMap((result) => result.data.contests));
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, states, query]);

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
      data={contests}
      keyExtractor={(w) => w.slug}
      renderItem={onRender}
      ListEmptyComponent={isLoading ? ContestListPlaceholder : ContestsEmptyResult}
      ListEmptyComponentStyle={{ minHeight: "80%" }}
    />
  );
};
