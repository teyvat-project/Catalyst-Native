import { useDeviceLayout } from "@/lib/device-layout";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { clientAtom } from "@/models/atoms/credential";
import type { EgeriaUser } from "@/models/sdk-types";
import { FlashList, FlashListRef, ListRenderItem } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { useCallback, useImperativeHandle, useRef, useState } from "react";
import { UserCard } from "./card";
import { UsersEmptyResult } from "./empty-result";
import { UserListPlaceholder } from "./skeleton";

type TimelineHandle = {
  scrollToTop: () => void;
};

type Props = {
  query: string;
  ref?: React.Ref<TimelineHandle>;
};

export const UserList = ({ query, ref }: Props) => {
  const client = useAtomValue(clientAtom);
  const { listColumns } = useDeviceLayout();
  const [users, setUsers] = useState<EgeriaUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const list = useRef<FlashListRef<EgeriaUser>>(null);

  const onRender = useCallback<ListRenderItem<EgeriaUser>>(({ item }) => {
    return <UserCard user={item} />;
  }, []);

  useAsyncEffect(async () => {
    setIsLoading(true);
    setUsers([]);
    try {
      if (client) {
        const { data } = await client.egeria.v1.search.get({ query: { q: query }, throwOnError: true });
        setUsers(data.users as EgeriaUser[]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, query]);

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
      data={users}
      keyExtractor={(w) => w.id}
      renderItem={onRender}
      ListEmptyComponent={isLoading ? UserListPlaceholder : UsersEmptyResult}
      ListEmptyComponentStyle={{ minHeight: "80%" }}
    />
  );
};
