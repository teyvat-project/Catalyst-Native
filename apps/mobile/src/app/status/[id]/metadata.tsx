import {
  CatalystAvatar,
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystDivider,
  CatalystEmptyState,
  CatalystSwitch,
  CatalystText,
} from "@/components/design-system";
import {
  ApplyToAllSheet,
  type ApplyToAllOption,
  type ApplyToAllSheetRef,
} from "@/components/metadata-editor/apply-to-all-sheet";
import { MetadataRow } from "@/components/metadata-editor/metadata-row";
import { PhotoPager } from "@/components/metadata-editor/photo-pager";
import { PinEditorModal } from "@/components/metadata-editor/pin-editor";
import { PlatformSheet, type PlatformSheetRef } from "@/components/metadata-editor/platform-sheet";
import { UserPickerModal } from "@/components/metadata-editor/user-picker-modal";
import { WorldPickerModal } from "@/components/metadata-editor/world-picker";
import { ThumbnailStrip } from "@/components/metadata-editor/thumbnail-strip";
import { accountAtom } from "@/models/atoms/account";
import { clientAtom } from "@/models/atoms/credential";
import { metadataRevisionAtomFamily } from "@/models/atoms/epiclese-metadata";
import {
  applyToAll,
  collectUserProfiles,
  isMetadataConfigured,
  isMetadataDirty,
  setPlatform,
  toEditableMetadata,
  type ApplyToAllField,
  type EditableMediaMetadata,
  type EditableWorld,
  type UserProfile,
} from "@/models/epiclese-metadata-editor";
import { setPins, type EditablePin } from "@/models/epiclese-pin-editor";
import type { Media } from "@/models/sdk-types";
import type { EpiclesePlatformResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { Stack, useLocalSearchParams, usePreventRemove, useRouter } from "expo-router";
import { useAtomValue, useSetAtom } from "jotai";
import { Copy, EyeOff, MapPin, Users } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { withUniwind } from "uniwind";

const UniCopy = withUniwind(Copy);
const UniEyeOff = withUniwind(EyeOff);
const UniMapPin = withUniwind(MapPin);
const UniUsers = withUniwind(Users);

const HIDE_AUTO_DESCRIPTION =
  "ResoniteScreenshotExtensions や VRCX などのツールで画像に埋め込まれたメタデータがある場合でも、表示したくないときは ON にしてください。編集画面から追加したメタデータは引き続き表示されます。";

const APPLY_TO_ALL_OPTIONS: ApplyToAllOption[] = [
  { field: "platformAndWorld", label: "プラットフォームとワールド", icon: UniMapPin },
  { field: "users", label: "写っている人", icon: UniUsers },
  { field: "privacyMetadata", label: "表示設定", icon: UniEyeOff },
];

type LoadState = { kind: "loading" } | { kind: "forbidden" } | { kind: "error" } | { kind: "ready"; medias: Media[] };

export default function StatusMetadataScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // トークン更新のたびに accountAtom は作り直されるので、読み込みはユーザー ID とクライアントにだけ追従させる。
  // account そのものに追従すると、更新のたびに読み込み直して編集中の内容が消える
  const userId = useAtomValue(accountAtom)?.user.id;
  const client = useAtomValue(clientAtom);
  const setMetadataRevision = useSetAtom(metadataRevisionAtomFamily(id));

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [initialItems, setInitialItems] = useState<EditableMediaMetadata[]>([]);
  const [items, setItems] = useState<EditableMediaMetadata[]>([]);
  const [index, setIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [platforms, setPlatforms] = useState<EpiclesePlatformResponse[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const applyToAllSheetRef = useRef<ApplyToAllSheetRef>(null);
  const platformSheetRef = useRef<PlatformSheetRef>(null);
  const [isUserPickerVisible, setIsUserPickerVisible] = useState(false);
  const [isWorldPickerVisible, setIsWorldPickerVisible] = useState(false);
  const [isPinEditorVisible, setIsPinEditorVisible] = useState(false);

  const isDirty = isMetadataDirty(initialItems, items);
  const canSave = isDirty && !isSubmitting;

  useEffect(() => {
    if (!id) return;
    if (!userId) {
      setLoadState({ kind: "forbidden" });
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoadState({ kind: "loading" });

      try {
        const { data } = await client.catalyst.v11.status.id.get({
          path: { id },
          throwOnError: true,
        });
        if (cancelled) return;
        if (data.status.user?.id !== userId) {
          setLoadState({ kind: "forbidden" });
          return;
        }

        // 保存は全置換なので、どれか 1 つでも欠けたら編集させない (送り返す値が欠けて消えるのを防ぐ)
        const [metadata, platforms] = await Promise.all([
          client.epiclese.v1.tag.by.status.id.get({ path: { id }, throwOnError: true }).then(({ data }) => data),
          client.epiclese.v1.platforms.get({ throwOnError: true }).then(({ data }) => data.platforms),
        ]);
        if (cancelled) return;

        const editable = toEditableMetadata(data.status.medias, metadata, platforms);
        setPlatforms(platforms);
        setUserProfiles(collectUserProfiles(metadata));
        setInitialItems(editable);
        setItems(editable);
        setIndex(0);
        setLoadState({ kind: "ready", medias: data.status.medias });
      } catch (error) {
        console.error("Failed to load metadata:", error);
        if (!cancelled) setLoadState({ kind: "error" });
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id, userId, client, reloadKey]);

  const updateCurrent = useCallback(
    (updater: (item: EditableMediaMetadata) => EditableMediaMetadata) => {
      setItems((prev) => prev.map((item, i) => (i === index ? updater(item) : item)));
    },
    [index],
  );

  const handleTogglePrivacy = useCallback(
    (value: boolean) => updateCurrent((item) => ({ ...item, privacyMetadata: value })),
    [updateCurrent],
  );

  const handleSelectUsers = useCallback(
    (users: { id: string }[], profiles: Record<string, UserProfile>) => {
      setUserProfiles((prev) => ({ ...prev, ...profiles }));
      updateCurrent((item) => ({ ...item, users }));
      setIsUserPickerVisible(false);
    },
    [updateCurrent],
  );

  const handleSelectWorld = useCallback(
    (world: EditableWorld | undefined) => {
      updateCurrent((item) => ({ ...item, world }));
      setIsWorldPickerVisible(false);
    },
    [updateCurrent],
  );

  const handleDonePins = useCallback(
    (pins: EditablePin[]) => {
      updateCurrent((item) => setPins(item, pins));
      setIsPinEditorVisible(false);
    },
    [updateCurrent],
  );

  const handleSelectPlatform = useCallback(
    (platformId: string | undefined) => updateCurrent((item) => setPlatform(item, platformId)),
    [updateCurrent],
  );

  const handleApplyToAll = useCallback(
    (field: ApplyToAllField) => {
      setItems((prev) => applyToAll(prev, index, field));
    },
    [index],
  );

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setIsSubmitting(true);

    try {
      await client.epiclese.v1.tag.by.status.id.create({
        path: { id },
        body: items,
        throwOnError: true,
      });
      setMetadataRevision((revision) => revision + 1);
      setIsSaved(true);
    } catch (error) {
      console.error("Failed to save metadata:", error);
      Alert.alert("エラー", "メタデータの保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }, [canSave, client, id, items, setMetadataRevision]);

  // 保存済みにしたレンダーで usePreventRemove が外れてから戻る。同じレンダーで戻ると破棄確認が出てしまう
  useEffect(() => {
    if (isSaved) router.back();
  }, [isSaved, router]);

  // 保存中は離れさせない。破棄して離れても送信中の保存は取り消せず、結果だけが残ってしまうため
  usePreventRemove(isSubmitting || (isDirty && !isSaved), ({ repeat }) => {
    if (isSubmitting) return;

    Alert.alert("変更を破棄しますか？", undefined, [
      { text: "編集を続ける", style: "cancel" },
      {
        text: "破棄",
        style: "destructive",
        // 変更を戻して preventRemove を false にしてから、止めた画面遷移をやり直す
        onPress: () => {
          setItems(initialItems);
          repeat();
        },
      },
    ]);
  });

  if (loadState.kind === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-light-background dark:bg-dark-background">
        <ActivityIndicator size="large" colorClassName="accent-light-tint dark:accent-dark-tint" />
      </View>
    );
  }

  if (loadState.kind === "forbidden") {
    return (
      <View className="flex-1 bg-light-background dark:bg-dark-background">
        <CatalystEmptyState title="この投稿のメタデータは編集できません" />
      </View>
    );
  }

  if (loadState.kind === "error") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-light-background px-6 dark:bg-dark-background">
        <CatalystEmptyState className="h-auto" title="メタデータを読み込めませんでした" />
        <CatalystButton tone="secondary" onPress={() => setReloadKey((key) => key + 1)}>
          <CatalystButtonText>再読み込み</CatalystButtonText>
        </CatalystButton>
      </View>
    );
  }

  const { medias } = loadState;
  const current = items[index];
  const currentPlatform = platforms.find((platform) => platform.id === current?.platform);
  const currentUsers = current?.users ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleSave} disabled={!canSave} hitSlop={8} className="px-1 py-2">
              <CatalystText
                variant="subtitle"
                tone={canSave ? "tint" : "subtle"}
                className={!canSave ? "opacity-60" : undefined}
              >
                保存
              </CatalystText>
            </Pressable>
          ),
        }}
      />
      <View className="flex-1 bg-light-surface-muted dark:bg-dark-background">
        {isSubmitting && (
          <View className="absolute inset-0 z-50 items-center justify-center bg-light-overlay dark:bg-dark-overlay">
            <ActivityIndicator size="large" colorClassName="accent-light-tint dark:accent-dark-tint" />
          </View>
        )}
        <ScrollView className="flex-1">
          <PhotoPager medias={medias} index={index} onIndexChange={setIndex} />
          {medias.length >= 2 && (
            <View className="bg-light-background dark:bg-dark-surface">
              <ThumbnailStrip
                medias={medias}
                index={index}
                configured={items.map(isMetadataConfigured)}
                onSelect={setIndex}
              />
            </View>
          )}

          <View className="mt-6">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              この写真の設定
            </CatalystText>
            <MetadataRow
              label="プラットフォーム"
              value={currentPlatform?.name ?? "未選択"}
              onPress={() => platformSheetRef.current?.open()}
            />
            <CatalystDivider className="ml-5 w-auto" />
            <MetadataRow
              label="ワールド"
              disabled={!currentPlatform}
              value={
                !currentPlatform
                  ? "先にプラットフォームを選択してください"
                  : current?.world
                    ? [current.world.name, current.world.author?.name].filter(Boolean).join("・")
                    : "未選択"
              }
              onPress={() => setIsWorldPickerVisible(true)}
            />
            <CatalystDivider className="ml-5 w-auto" />
            <MetadataRow
              label="写っている人"
              onPress={() => setIsUserPickerVisible(true)}
              value={
                currentUsers.length === 0 ? (
                  "未選択"
                ) : (
                  <>
                    <View className="flex-row">
                      {currentUsers.slice(0, 3).map((user, i) => (
                        <CatalystAvatar
                          key={user.id}
                          size="sm"
                          source={userProfiles[user.id]?.iconUrl}
                          fallback={userProfiles[user.id]?.displayName ?? user.id.slice(0, 8)}
                          className={
                            i > 0 ? "-ml-2 border-2 border-light-background dark:border-dark-surface" : undefined
                          }
                        />
                      ))}
                    </View>
                    <CatalystText tone="muted">{currentUsers.length} 人</CatalystText>
                  </>
                )
              }
            />
            <CatalystDivider className="ml-5 w-auto" />
            <MetadataRow
              label="ピン"
              value={current?.reference.length ? `${current.reference.length} 件` : "未設定"}
              onPress={() => setIsPinEditorVisible(true)}
            />
            <CatalystDivider className="ml-5 w-auto" />
            <View className="min-h-16 flex-row items-center bg-light-background px-5 py-3 dark:bg-dark-surface">
              <CatalystText variant="subtitle" className="mr-4 flex-1 text-[15px] font-semibold">
                自動設定されたメタデータを表示しない
              </CatalystText>
              <CatalystSwitch value={current?.privacyMetadata ?? false} onValueChange={handleTogglePrivacy} />
            </View>
            <CatalystText variant="caption" tone="subtle" className="px-5 pt-2 leading-4">
              {HIDE_AUTO_DESCRIPTION}
            </CatalystText>
          </View>

          {medias.length >= 2 && (
            <View className="px-5 py-6">
              <CatalystButton tone="secondary" onPress={() => applyToAllSheetRef.current?.open()}>
                <CatalystButtonIcon>
                  <UniCopy />
                </CatalystButtonIcon>
                <CatalystButtonText>すべての写真に適用…</CatalystButtonText>
              </CatalystButton>
            </View>
          )}
        </ScrollView>
      </View>
      <ApplyToAllSheet ref={applyToAllSheetRef} options={APPLY_TO_ALL_OPTIONS} onSelect={handleApplyToAll} />
      <UserPickerModal
        visible={isUserPickerVisible}
        users={currentUsers}
        profiles={userProfiles}
        onCancel={() => setIsUserPickerVisible(false)}
        onDone={handleSelectUsers}
      />
      {currentPlatform && (
        <WorldPickerModal
          visible={isWorldPickerVisible}
          platform={currentPlatform}
          platforms={platforms}
          value={current?.world}
          onCancel={() => setIsWorldPickerVisible(false)}
          onSelect={handleSelectWorld}
        />
      )}
      {medias[index] && (
        <PinEditorModal
          visible={isPinEditorVisible}
          media={medias[index]}
          pins={current?.reference ?? []}
          platform={currentPlatform}
          platforms={platforms}
          onCancel={() => setIsPinEditorVisible(false)}
          onDone={handleDonePins}
        />
      )}
      <PlatformSheet
        ref={platformSheetRef}
        platforms={platforms}
        value={current?.platform}
        onSelect={handleSelectPlatform}
      />
    </>
  );
}
