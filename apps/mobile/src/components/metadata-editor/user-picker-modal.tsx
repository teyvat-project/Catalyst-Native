import { CatalystAvatar, CatalystListItem, CatalystSearchField, CatalystText } from "@/components/design-system";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { clientAtom } from "@/models/atoms/credential";
import { MAX_USERS, toggleUser, toUserProfile, type UserProfile } from "@/models/epiclese-metadata-editor";
import { forgetRecentUser, loadRecentUsers, recordRecentUsers, type RecentUser } from "@/models/epiclese-recent-users";
import type { UserResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { PickerHeader } from "./picker-header";
import {
  forgetOnLongPress,
  PICK_LIST_CLASS,
  PICK_ROW_CLASS,
  PickGroup,
  PickSeparator,
  PickTrailing,
  SectionLabel,
  useRefetchOnPick,
} from "./recent-picks";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const UniX = withUniwind(X);
const UniSafeAreaView = withUniwind(SafeAreaView);

type Props = {
  visible: boolean;
  users: { id: string }[];
  profiles: Record<string, UserProfile>;
  onCancel: () => void;
  onDone: (users: { id: string }[], profiles: Record<string, UserProfile>) => void;
};

// 「完了」を押すまで編集画面には反映しないので、開いている間は下書きを持つ
export const UserPickerModal = ({ visible, users, profiles, onCancel, onDone }: Props) => {
  const client = useAtomValue(clientAtom);
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(users);
  const [draftProfiles, setDraftProfiles] = useState(profiles);
  const [query, setQuery] = useState("");
  const [isLimited, setIsLimited] = useState(false);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  // 今回の操作の間に履歴から外した人。「完了」で記録し直して履歴に戻さないよう覚えておく
  const forgottenRef = useRef(new Set<string>());
  const forgetUser = (id: string) => {
    forgottenRef.current.add(id);
    forgetRecentUser(id).catch(() => {});
    setRecentUsers((prev) => prev.filter((recent) => recent.id !== id));
  };

  // 最近使ったユーザーは、追加するときに取り直してアイコンや表示名を新しくする。外すときは取り直さない。
  // 取り直している間は、ほかの行やチップの操作と「完了」を受け付けない。
  // このモーダルは閉じてもマウントされたままなので、開閉のたびに取り直しを止め、届いた結果で次の下書きを書き換えない
  const { verifyingId, pick, cancel, isBusy } = useRefetchOnPick({
    kind: "ユーザー",
    fetch: async (id) => {
      const { data, response } = await client.egeria.v1.user.by.id.id.get({ path: { id } });
      return { data: data?.user, response };
    },
    onGone: forgetUser,
  });

  useEffect(() => {
    cancel();
    if (!visible) return;

    forgottenRef.current = new Set();
    setDraft(users);
    setDraftProfiles(profiles);
    setQuery("");
    setIsLimited(false);
    loadRecentUsers().then(setRecentUsers);
    // 開いた時点の値から始めればよく、開いている間に親の値が変わっても下書きは作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const fetchUsers = useCallback(
    async (q: string) => {
      const { data } = await client.egeria.v1.search.get({ query: { q }, throwOnError: true });
      return data.users;
    },
    [client],
  );
  const { results, resultsQuery, isLoading, isError, retry } = useDebouncedSearch<UserResponse>(query, fetchUsers, {
    skipEmpty: true,
  });

  const handleToggle = useCallback((user: Pick<UserResponse, "id" | "displayName" | "screenName" | "profile">) => {
    // 履歴から外したあとで自分で足し直した人は、「完了」でまた記録する
    forgottenRef.current.delete(user.id);
    setDraftProfiles((prev) => ({ ...prev, [user.id]: toUserProfile(user) }));
    setDraft((prev) => {
      const next = toggleUser(prev, user.id);
      setIsLimited(next.limited);
      return next.users;
    });
  }, []);

  const handleRemove = useCallback((userId: string) => {
    setDraft((prev) => prev.filter((user) => user.id !== userId));
    setIsLimited(false);
  }, []);

  const isDrafted = (userId: string) => draft.some((user) => user.id === userId);
  const handleToggleRecent = (user: RecentUser) => {
    if (isBusy()) return;
    if (isDrafted(user.id)) return handleRemove(user.id);
    if (draft.length >= MAX_USERS) return setIsLimited(true);
    void pick(user.id, undefined, handleToggle);
  };

  // 検索欄が空のときだけ、最近使ったユーザーを出す (検索は空欄では行わないので、検索結果と重なることはない)
  const shownRecentUsers = resultsQuery?.trim() === "" ? recentUsers : [];

  // 「完了」のときに、今回新しく追加した人だけを記録する (もとから付いていた人は記録せず、開いて閉じただけで並びが変わらないように)。
  // 今回の操作の間に履歴から外した人も記録しない。
  // 後から追加した人ほど先頭に来るよう、逆順に入れる
  const handleDone = () => {
    if (isBusy()) return;
    const initialIds = new Set(users.map((user) => user.id));
    const added = draft
      .filter((user) => !initialIds.has(user.id) && !forgottenRef.current.has(user.id) && draftProfiles[user.id])
      .map((user) => ({ id: user.id, ...draftProfiles[user.id] }))
      .reverse();
    if (added.length > 0) recordRecentUsers(added).catch(() => {});
    onDone(draft, draftProfiles);
  };

  const renderUser = (user: RecentUser, onPress: () => void, isRecent: boolean) => {
    const isSelected = isDrafted(user.id);

    return (
      <CatalystListItem
        key={user.id}
        onPress={onPress}
        {...(isRecent &&
          user.id !== verifyingId &&
          forgetOnLongPress({
            name: user.displayName,
            section: "最近使ったユーザー",
            onForget: () => forgetUser(user.id),
          }))}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        divided={false}
        className={`px-4 ${PICK_ROW_CLASS}`}
      >
        <CatalystAvatar source={user.iconUrl} fallback={user.displayName} />
        <View className="min-w-0 flex-1">
          <CatalystText variant="label" numberOfLines={1}>
            {user.displayName}
          </CatalystText>
          <CatalystText variant="caption" tone="muted" numberOfLines={1}>
            @{user.screenName}
          </CatalystText>
        </View>
        <PickTrailing verifying={user.id === verifyingId} selected={isSelected} />
      </CatalystListItem>
    );
  };

  const displayNameOf = (userId: string) => draftProfiles[userId]?.displayName ?? userId.slice(0, 8);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      {/* Android では pageSheet が効かず全画面表示になり、edge-to-edge でステータスバーの裏まで描画されるので上端と左右を避ける。
          下端は一覧ごとにホームインジケーターぶんの余白を取っている。iOS はシート表示なので避けない */}
      <UniSafeAreaView
        edges={Platform.OS === "android" ? ["top", "left", "right"] : []}
        className="flex-1 bg-light-background dark:bg-dark-background"
      >
        <PickerHeader
          title="写っている人"
          left={{ label: "キャンセル", onPress: onCancel }}
          right={{ label: "完了", onPress: handleDone, disabled: verifyingId !== null }}
        />

        <View className="gap-2 px-4 py-3">
          <CatalystText variant="caption" tone="subtle">
            {draft.length}/{MAX_USERS} 人
          </CatalystText>
          {draft.length === 0 ? (
            <CatalystText tone="muted">ユーザーが選択されていません</CatalystText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {draft.map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => !isBusy() && handleRemove(user.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${displayNameOf(user.id)} を外す`}
                  className="flex-row items-center gap-1.5 rounded-full bg-light-surface-muted py-1 pr-2.5 pl-1 dark:bg-dark-surface-muted"
                >
                  <CatalystAvatar
                    size="sm"
                    source={draftProfiles[user.id]?.iconUrl}
                    fallback={displayNameOf(user.id)}
                    className="size-6"
                  />
                  <CatalystText className="max-w-32" numberOfLines={1}>
                    {displayNameOf(user.id)}
                  </CatalystText>
                  <UniX size={14} className="text-light-icon dark:text-dark-icon" />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {isLimited && <CatalystText tone="danger">最大 {MAX_USERS} 人まで選べます</CatalystText>}
          <CatalystSearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="表示名やユーザー名で検索..."
            autoCapitalize="none"
            autoCorrect={false}
          />
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
            data={results}
            keyExtractor={(user) => user.id}
            keyboardShouldPersistTaps="handled"
            // 末尾の行がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る
            className={PICK_LIST_CLASS}
            ItemSeparatorComponent={PickSeparator}
            contentContainerStyle={{ paddingBottom: insets.bottom }}
            ListEmptyComponent={
              isLoading ? (
                <ActivityIndicator className="py-8" colorClassName="accent-light-tint dark:accent-dark-tint" />
              ) : query.trim() !== "" ? (
                <CatalystText tone="muted" className="px-6 py-8 text-center">
                  一致するユーザーが見つかりませんでした。
                </CatalystText>
              ) : undefined
            }
            ListHeaderComponent={
              shownRecentUsers.length > 0 ? (
                <View>
                  <SectionLabel first>最近使ったユーザー</SectionLabel>
                  <PickGroup>
                    {shownRecentUsers.map((user) => renderUser(user, () => handleToggleRecent(user), true))}
                  </PickGroup>
                </View>
              ) : undefined
            }
            renderItem={({ item: user }) =>
              renderUser({ id: user.id, ...toUserProfile(user) }, () => !isBusy() && handleToggle(user), false)
            }
          />
        )}
      </UniSafeAreaView>
    </Modal>
  );
};
