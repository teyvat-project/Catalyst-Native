import { CatalystListItem, CatalystSearchField, CatalystText } from "@/components/design-system";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { clientAtom } from "@/models/atoms/credential";
import type { EditableWorld } from "@/models/epiclese-metadata-editor";
import { forgetRecentWorld, loadRecentWorlds, type RecentWorld } from "@/models/epiclese-recent-worlds";
import type { EpiclesePlatformResponse, EpicleseWorldResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PickerHeader } from "../picker-header";
import {
  forgetOnLongPress,
  PICK_LIST_CLASS,
  PICK_ROW_CLASS,
  PickGroup,
  PickSeparator,
  PickTrailing,
  SectionLabel,
  useRefetchOnPick,
} from "../recent-picks";

type Props = {
  platform: EpiclesePlatformResponse;
  value: EditableWorld | undefined;
  onCancel: () => void;
  onSelect: (world: EpicleseWorldResponse) => void;
  onClear: () => void;
  onRegister: () => void;
};

type Row = { id: string; name: string; authorName: string | undefined; onPress: () => void };

export const WorldSearchStep = ({ platform, value, onCancel, onSelect, onClear, onRegister }: Props) => {
  const client = useAtomValue(clientAtom);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const fetchWorlds = useCallback(
    async (q: string) => {
      const { data } = await client.epiclese.v1.worlds.get({ query: { q, platform: platform.id }, throwOnError: true });
      return data.items;
    },
    [client, platform.id],
  );
  const { results, resultsQuery, isLoading, isError, retry } = useDebouncedSearch(query, fetchWorlds);

  const [recentWorlds, setRecentWorlds] = useState<RecentWorld[]>([]);
  useEffect(() => {
    // プラットフォームが変わったあとに、前のプラットフォームの読み出しが遅れて届いても使わない
    let active = true;
    setRecentWorlds([]);
    loadRecentWorlds(platform.id).then((worlds) => active && setRecentWorlds(worlds));
    return () => {
      active = false;
    };
  }, [platform.id]);

  const forgetWorld = (id: string) => {
    forgetRecentWorld(platform.id, id).catch(() => {});
    setRecentWorlds((prev) => prev.filter((recent) => recent.id !== id));
  };

  // 検索結果のワールドはそのまま、最近使ったワールドで検索結果に無いものは取り直してから選ぶ
  const { verifyingId, pick, isBusy } = useRefetchOnPick({
    kind: "ワールド",
    fetch: async (id) => {
      const { data, response } = await client.epiclese.v1.worlds.id.get({ path: { id } });
      return { data: data?.world, response };
    },
    onGone: forgetWorld,
  });

  // 選択中のワールドの行も、確かめている間はほかの行と同じく受け付けない
  const handleCancel = () => !isBusy() && onCancel();

  // 出し分けと名前の差し替えはアイテム検索と同じ。検索欄が空のときは最近使ったワールドを先頭に出し、検索結果からは除く
  const latest = new Map(results.map((world) => [world.id, world]));
  const recentRows: Row[] =
    resultsQuery?.trim() === ""
      ? recentWorlds.map((recent) => {
          const fresh = latest.get(recent.id);
          const world = fresh ?? recent;
          return {
            id: world.id,
            name: world.name,
            authorName: world.author?.name,
            // 選択中のワールドは、以前と同じく取り直さずに閉じるだけにする
            onPress: world.id === value?.id && !fresh ? handleCancel : () => void pick(world.id, fresh, onSelect),
          };
        })
      : [];
  const recentIds = new Set(recentRows.map((row) => row.id));
  const rows: Row[] = results
    .filter((world) => !recentIds.has(world.id))
    .map((world) => ({
      id: world.id,
      name: world.name,
      authorName: world.author?.name,
      onPress: () => void pick(world.id, world, onSelect),
    }));
  // 選択中のワールドが最近使ったワールドにも検索結果にも無くても、何が選ばれているかが分かるように一覧の先頭に出す (Web 版と同じ)
  if (value?.id && !recentIds.has(value.id) && !rows.some((row) => row.id === value.id)) {
    rows.unshift({ id: value.id, name: value.name, authorName: value.author?.name, onPress: handleCancel });
  }

  const renderRow = (row: Row, isRecent: boolean) => {
    const isSelected = row.id === value?.id;

    return (
      <CatalystListItem
        key={row.id}
        onPress={row.onPress}
        {...(isRecent &&
          row.id !== verifyingId &&
          forgetOnLongPress({ name: row.name, section: "最近使ったワールド", onForget: () => forgetWorld(row.id) }))}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        divided={false}
        className={`px-4 ${PICK_ROW_CLASS}`}
      >
        <View className="min-w-0 flex-1">
          <CatalystText variant="label" numberOfLines={1}>
            {row.name}
          </CatalystText>
          {row.authorName && (
            <CatalystText variant="caption" tone="muted" numberOfLines={1}>
              {row.authorName}
            </CatalystText>
          )}
        </View>
        <PickTrailing verifying={row.id === verifyingId} selected={isSelected} />
      </CatalystListItem>
    );
  };

  return (
    <>
      <PickerHeader title="ワールド" left={{ label: "キャンセル", onPress: onCancel }} />
      <View className="gap-3 px-4 py-3">
        <CatalystSearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
          placeholder="ワールド名もしくは ID を入力..."
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value && (
          <Pressable onPress={() => !isBusy() && onClear()} hitSlop={8} className="self-start">
            <CatalystText tone="danger">選択を外す</CatalystText>
          </Pressable>
        )}
      </View>

      {isError ? (
        <View className="items-center gap-3 px-6 py-8">
          <CatalystText tone="muted">読み込みに失敗しました</CatalystText>
          <Pressable onPress={retry} hitSlop={8}>
            <CatalystText tone="tint">再読み込み</CatalystText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          keyboardShouldPersistTaps="handled"
          // 末尾の行がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る
          className={PICK_LIST_CLASS}
          ItemSeparatorComponent={PickSeparator}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator className="py-8" colorClassName="accent-light-tint dark:accent-dark-tint" />
            ) : recentRows.length > 0 ? undefined : (
              <CatalystText tone="muted" className="px-6 py-8 text-center">
                一致するワールドが見つかりませんでした。
              </CatalystText>
            )
          }
          ListHeaderComponent={
            recentRows.length > 0 ? (
              <View>
                <SectionLabel first>最近使ったワールド</SectionLabel>
                <PickGroup>{recentRows.map((row) => renderRow(row, true))}</PickGroup>
                {(isLoading || rows.length > 0) && <SectionLabel>ワールド一覧</SectionLabel>}
              </View>
            ) : undefined
          }
          ListFooterComponent={
            <Pressable onPress={onRegister} className="px-4 py-5">
              <CatalystText tone="tint">見つからない場合はワールドを登録</CatalystText>
            </Pressable>
          }
          renderItem={({ item: row }) => renderRow(row, false)}
        />
      )}
    </>
  );
};
