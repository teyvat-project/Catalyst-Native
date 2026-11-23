import { EmojiPickerSheet, type EmojiPickerSheetRef } from "@/components/emoji-verse";
import type { EmojiItem } from "@natsuneko-laboratory/react-native-emoji-verse";
import {
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystDivider,
  CatalystIconButton,
  CatalystText,
  CatalystTextField,
} from "@/components/design-system";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { getCdnUrl } from "@/lib/media";
import { uploadImage as uploadMedia, UnsupportedImageError } from "@/lib/media-upload";
import { accountAtom } from "@/models/atoms/account";
import { clientAtom } from "@/models/atoms/credential";
import type {
  EgeriaUser,
  EgeriaUserProfile,
  ProfileEmoji as ProfileEmojiType,
  ProfileEmojiRequest,
  ProfileTag,
  ProfileTagSuggestion,
} from "@/models/sdk-types";
import * as FileSystem from "expo-file-system";
import { Image as ExpoImage } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import { Camera, Plus, Trash2, X } from "lucide-react-native";
import { type PropsWithChildren, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import ImageCropPicker, { Image } from "react-native-image-crop-picker";
import Toast from "react-native-toast-message";
import { withUniwind } from "uniwind";

const PROFILE_TAG_MAX_COUNT = 10;
const PROFILE_TAG_MAX_LENGTH = 30;

const UniImage = withUniwind(ExpoImage);
const UniCamera = withUniwind(Camera);
const UniPlus = withUniwind(Plus);
const UniTrash2 = withUniwind(Trash2);
const UniX = withUniwind(X);

const BANNER_WIDTH = 1500;
const BANNER_CROP_HEIGHT = 500;
const ICON_SIZE = 512;
const MAX_ADDITIONAL_WEBSITES = 4;

type ProfileEditSectionProps = PropsWithChildren<{
  title?: string;
  caption?: string;
}>;

const ProfileEditSection = ({ caption, children, title }: ProfileEditSectionProps) => (
  <View className="bg-light-background dark:bg-dark-surface">
    {title ? (
      <View className="px-5 pb-2 pt-5">
        <CatalystText variant="caption" tone="muted" className="font-semibold uppercase">
          {title}
        </CatalystText>
        {caption ? (
          <CatalystText variant="caption" tone="subtle" className="mt-1 leading-4">
            {caption}
          </CatalystText>
        ) : null}
      </View>
    ) : null}
    {children}
  </View>
);

type ProfileEditFieldProps = PropsWithChildren<{
  error?: string | null;
  label: string;
}>;

const ProfileEditField = ({ children, error, label }: ProfileEditFieldProps) => (
  <View className="px-5 py-4">
    <CatalystText variant="label" className="mb-2">
      {label}
    </CatalystText>
    {children}
    {error ? (
      <CatalystText variant="caption" tone="danger" className="mt-2">
        {error}
      </CatalystText>
    ) : null}
  </View>
);

function isValidUrl(text: string): boolean {
  if (!text.trim()) return true;
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.host;
  } catch {
    return false;
  }
}

export default function ProfileEditScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const bannerHeight = screenWidth / 3;
  const router = useRouter();
  const [account, setAccount] = useAtom(accountAtom);
  const client = useAtomValue(clientAtom);
  const user = account?.user as EgeriaUser | undefined;

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [profileEmoji, setProfileEmoji] = useState<ProfileEmojiType | null>(user?.profileEmoji ?? null);
  const [profileEmojiRequest, setProfileEmojiRequest] = useState<ProfileEmojiRequest | null | undefined>(undefined);
  const [bio, setBio] = useState(user?.profile?.bio ?? "");
  const [website, setWebsite] = useState(user?.profile?.website ?? "");
  const [additionalWebsites, setAdditionalWebsites] = useState<string[]>(
    user?.profile?.additionalWebsites?.filter((w) => !!w.trim()) ?? [],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [tags, setTags] = useState<ProfileTag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestions, setSuggestions] = useState<ProfileTagSuggestion[]>([]);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef<string>("");
  const profileEmojiPickerRef = useRef<EmojiPickerSheetRef>(null);

  useAsyncEffect(async () => {
    if (!user) return;
    const result = await client.catalyst.v1.profileTags.by.user.id
      .get({ path: { id: user.id }, throwOnError: true })
      .then((r) => r.data.tags)
      .catch(() => []);
    setTags(result);
  }, [user?.id]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!displayName.trim()) errors.push("表示名を入力してください");
    if (!isValidUrl(website)) errors.push("ウェブサイトのURLが無効です");
    for (const w of additionalWebsites) {
      if (!isValidUrl(w)) {
        errors.push("追加ウェブサイトのURLが無効です");
        break;
      }
    }
    return errors;
  }, [displayName, website, additionalWebsites]);

  const canSave = validationErrors.length === 0 && !isSubmitting && !isUploadingImage;

  const uploadImage = useCallback(
    async (img: Image): Promise<string | null> => {
      const file = new FileSystem.File(img.path);
      return await uploadMedia(client, await file.arrayBuffer());
    },
    [client],
  );

  const updateProfileImage = useCallback(
    async (field: "iconUrl" | "bannerUrl", img: Image) => {
      if (!account) return;

      setIsUploadingImage(true);
      try {
        const uploaded = await uploadImage(img);
        if (!uploaded) return;

        await client.egeria.v1.me.patch({
          body: {
            displayName: account.user.displayName,
            profile: { [field]: uploaded } as unknown as EgeriaUserProfile,
          },
          throwOnError: true,
        });

        const { data: me } = await client.egeria.v1.me.get({ throwOnError: true });
        if (me?.user) {
          setAccount((w) => ({ ...w!, user: me.user }));
        }
      } catch (error) {
        console.error(`Failed to upload ${field}:`, error);
        Toast.show({
          type: "error",
          text1: "エラー",
          text2: error instanceof UnsupportedImageError ? error.message : "画像のアップロードに失敗しました",
        });
      } finally {
        setIsUploadingImage(false);
      }
    },
    [account, client, uploadImage, setAccount],
  );

  const handlePickBanner = useCallback(async () => {
    try {
      const image = await ImageCropPicker.openPicker({
        width: BANNER_WIDTH,
        height: BANNER_CROP_HEIGHT,
        cropping: true,
        cropperToolbarTitle: "ヘッダー画像を切り取り",
        mediaType: "photo",
        maxFiles: 1,
      });
      await updateProfileImage("bannerUrl", image);
    } catch (e: any) {
      if (e?.code !== "E_PICKER_CANCELLED") {
        console.error("Banner pick error:", e);
      }
    }
  }, [updateProfileImage]);

  const handlePickIcon = useCallback(async () => {
    try {
      const image = await ImageCropPicker.openPicker({
        width: ICON_SIZE,
        height: ICON_SIZE,
        cropping: true,
        cropperCircleOverlay: true,
        cropperToolbarTitle: "アイコン画像を切り取り",
        mediaType: "photo",
        maxFiles: 1,
      });
      await updateProfileImage("iconUrl", image);
    } catch (e: any) {
      if (e?.code !== "E_PICKER_CANCELLED") {
        console.error("Icon pick error:", e);
      }
    }
  }, [updateProfileImage]);

  const handleAddWebsite = useCallback(() => {
    if (additionalWebsites.length < MAX_ADDITIONAL_WEBSITES) {
      setAdditionalWebsites((prev) => [...prev, ""]);
    }
  }, [additionalWebsites.length]);

  const handleRemoveWebsite = useCallback((index: number) => {
    setAdditionalWebsites((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateWebsite = useCallback((index: number, value: string) => {
    setAdditionalWebsites((prev) => prev.map((w, i) => (i === index ? value : w)));
  }, []);

  const handleTagInputChange = useCallback((value: string) => {
    setTagInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim().replace(/^[#＃]/, "").trim();
    if (q.length === 0) {
      setSuggestions([]);
      return;
    }
    latestQueryRef.current = q;
    debounceRef.current = setTimeout(async () => {
      if (q !== latestQueryRef.current) return;
      const result = await client.catalyst.v1.profileTags.suggestions
        .get({ query: { q }, throwOnError: true })
        .then((r) => r.data.tags)
        .catch(() => []);
      if (q !== latestQueryRef.current) return;
      setSuggestions(result);
    }, 300);
  }, [client]);

  const handleAddTag = useCallback((name: string) => {
    const trimmed = name.trim().replace(/^[#＃]/, "").trim();
    if (!trimmed) return;
    if (tags.length >= PROFILE_TAG_MAX_COUNT) {
      Toast.show({ type: "error", text1: "エラー", text2: `ハッシュタグは最大${PROFILE_TAG_MAX_COUNT}個まで設定できます` });
      return;
    }
    if (trimmed.length > PROFILE_TAG_MAX_LENGTH) {
      Toast.show({ type: "error", text1: "エラー", text2: `ハッシュタグは最大${PROFILE_TAG_MAX_LENGTH}文字までです` });
      return;
    }
    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      Toast.show({ type: "error", text1: "エラー", text2: "同じハッシュタグがすでに追加されています" });
      return;
    }
    setTags((prev) => [...prev, { id: `pending-${trimmed}`, name: trimmed, normalizedName: trimmed.toLowerCase() }]);
    setTagInput("");
    setSuggestions([]);
  }, [tags]);

  const handleRemoveTag = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleProfileEmojiSelected = useCallback((emoji: EmojiItem) => {
    if (emoji.type.kind === "unicode") {
      setProfileEmoji({
        type: "standard",
        value: emoji.type.emoji,
        imageUrl: "",
      });
      setProfileEmojiRequest({ type: "standard", value: emoji.type.emoji });
      return;
    }

    if (!emoji.type.customReactionId) return;

    setProfileEmoji({
      type: "custom",
      id: emoji.type.customReactionId,
      shortcode: emoji.id.replace(/^:/, "").replace(/:$/, ""),
      displayName: emoji.keywords[0] ?? emoji.id,
      imageUrl: emoji.type.url,
      width: 1,
      height: 1,
    });
    setProfileEmojiRequest({ type: "custom", customReactionId: emoji.type.customReactionId });
  }, []);

  const handleClearProfileEmoji = useCallback(() => {
    setProfileEmoji(null);
    setProfileEmojiRequest(null);
  }, []);

  const handleSaveTags = useCallback(async () => {
    setIsSavingTags(true);
    try {
      await client.catalyst.v1.profileTags.update({
        body: { tags: tags.map((t) => t.name) },
        throwOnError: true,
      });
      Toast.show({ type: "success", text1: "保存しました", text2: "ハッシュタグを保存しました" });
    } catch {
      Toast.show({ type: "error", text1: "エラー", text2: "ハッシュタグの保存に失敗しました" });
    } finally {
      setIsSavingTags(false);
    }
  }, [client, tags]);

  const handleSave = useCallback(async () => {
    if (!canSave || !account) return;

    setIsSubmitting(true);

    try {
      const filteredWebsites = additionalWebsites.filter((w) => !!w.trim());

      await client.egeria.v1.me.patch({
        body: {
          displayName: displayName.trim(),
          profile: {
            bio,
            website: website.trim(),
            additionalWebsites: filteredWebsites,
          } as EgeriaUserProfile,
          ...(profileEmojiRequest !== undefined ? { profileEmoji: profileEmojiRequest } : {}),
        },
        throwOnError: true,
      });

      const { data: me } = await client.egeria.v1.me.get({ throwOnError: true });
      if (me?.user) {
        setAccount({ user: me.user, credential: account.credential });
      }

      router.back();
    } catch (error) {
      console.error("Failed to update profile:", error);
      Toast.show({
        type: "error",
        text1: "エラー",
        text2: "プロフィールの更新に失敗しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [canSave, account, displayName, bio, website, additionalWebsites, profileEmojiRequest, client, setAccount, router]);

  const currentBannerUri = user?.profile?.bannerUrl
    ? getCdnUrl({ src: user.profile.bannerUrl, variant: "header", width: screenWidth })
    : null;

  const currentIconUri = user?.profile?.iconUrl
    ? getCdnUrl({ src: user.profile.iconUrl, variant: "icon", width: 128 })
    : null;

  if (!user) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "プロフィールを編集",
            headerBackTitle: "キャンセル",
          }}
        />
        <View className="flex-1 bg-light-background dark:bg-dark-background items-center justify-center">
          <ActivityIndicator size="large" colorClassName="accent-light-tint dark:accent-dark-tint" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "プロフィールを編集",
          headerBackTitle: "キャンセル",
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
        {(isSubmitting || isUploadingImage) && (
          <View className="absolute inset-0 z-50 items-center justify-center bg-light-overlay dark:bg-dark-overlay">
            <ActivityIndicator size="large" colorClassName="accent-light-tint dark:accent-dark-tint" />
          </View>
        )}
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={100}
        >
          <ScrollView className="flex-1" contentContainerClassName="pb-12">
            <View className="bg-light-background dark:bg-dark-surface">
              <Pressable onPress={handlePickBanner} disabled={isUploadingImage} className="active:opacity-95">
                <View
                  className="bg-light-surface-muted dark:bg-dark-surface-muted"
                  style={{ width: screenWidth, height: bannerHeight }}
                >
                  {currentBannerUri ? (
                    <UniImage source={{ uri: currentBannerUri }} contentFit="cover" className="h-full w-full" />
                  ) : (
                    <View className="h-full w-full bg-light-surface-elevated dark:bg-dark-surface-elevated" />
                  )}
                  <View className="absolute inset-0 items-center justify-center bg-black/35">
                    <View className="size-12 items-center justify-center rounded-full bg-black/35">
                      <UniCamera size={24} className="text-white" />
                    </View>
                  </View>
                </View>
              </Pressable>

              <View className="-mt-12 px-5 pb-5">
                <View className="flex-row items-end justify-between gap-4">
                  <View>
                    <Pressable onPress={handlePickIcon} disabled={isUploadingImage} className="active:opacity-90">
                      <View className="size-24 rounded-full border-4 border-light-background bg-light-surface-muted dark:border-dark-surface dark:bg-dark-surface-muted">
                        {currentIconUri ? (
                          <UniImage
                            source={{ uri: currentIconUri }}
                            className="h-full w-full rounded-full"
                            contentFit="cover"
                          />
                        ) : (
                          <View className="h-full w-full rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated" />
                        )}
                        <View className="absolute inset-0 items-center justify-center rounded-full bg-black/35">
                          <UniCamera size={20} className="text-white" />
                        </View>
                      </View>
                    </Pressable>
                    <CatalystText variant="caption" tone="subtle" className="mt-1.5">
                      正方形にクロップされます
                    </CatalystText>
                  </View>
                  <CatalystButton tone="secondary" size="sm" onPress={handlePickBanner} disabled={isUploadingImage}>
                    <CatalystButtonIcon>
                      <UniCamera />
                    </CatalystButtonIcon>
                    <CatalystButtonText>ヘッダー変更</CatalystButtonText>
                  </CatalystButton>
                </View>
              </View>
            </View>

            <View className="h-3" />

            <ProfileEditSection title="プロフィール">
              <ProfileEditField label="表示名" error={!displayName.trim() ? "表示名は必須です" : null}>
                <CatalystTextField
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="表示名"
                  className="min-h-11 border-b border-light-divider bg-transparent px-0 py-1 text-[16px] dark:border-dark-divider"
                />
              </ProfileEditField>

              <CatalystDivider className="ml-5 w-auto" />

              <View className="px-5 py-4">
                <CatalystText variant="label" className="mb-3">
                  プロフィール絵文字
                </CatalystText>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="min-w-0 flex-1 flex-row items-center gap-3">
                    <View className="size-11 items-center justify-center rounded-full bg-light-surface-muted dark:bg-dark-surface-muted">
                      <ProfileEmoji emoji={profileEmoji} size={24} />
                    </View>
                    <CatalystText variant="body" tone={profileEmoji ? "default" : "muted"} numberOfLines={1}>
                      {profileEmoji ? "表示名の横に表示されます" : "未設定"}
                    </CatalystText>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {profileEmoji ? (
                      <CatalystIconButton
                        label="プロフィール絵文字を削除"
                        size="sm"
                        tone="secondary"
                        onPress={handleClearProfileEmoji}
                      >
                        <UniTrash2 className="text-light-error dark:text-dark-error" />
                      </CatalystIconButton>
                    ) : null}
                    <CatalystButton size="sm" tone="tint" onPress={() => profileEmojiPickerRef.current?.open()}>
                      <CatalystButtonText>選択</CatalystButtonText>
                    </CatalystButton>
                  </View>
                </View>
              </View>

              <CatalystDivider className="ml-5 w-auto" />

              <ProfileEditField label="自己紹介">
                <CatalystTextField
                  value={bio}
                  onChangeText={setBio}
                  placeholder="自己紹介を入力..."
                  multiline
                  className="min-h-24 border-b border-light-divider bg-transparent px-0 py-1 text-[16px] dark:border-dark-divider"
                />
              </ProfileEditField>
            </ProfileEditSection>

            <View className="h-3" />

            <ProfileEditSection title="リンク">
              <ProfileEditField
                label="ウェブサイト"
                error={website.trim() && !isValidUrl(website) ? "有効なURLを入力してください (http:// または https://)" : null}
              >
                <CatalystTextField
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  className="min-h-11 border-b border-light-divider bg-transparent px-0 py-1 text-[16px] dark:border-dark-divider"
                />
              </ProfileEditField>

              {additionalWebsites.map((w, index) => (
                <View key={`additional-website-${index}`}>
                  <CatalystDivider className="ml-5 w-auto" />
                  <View className="px-5 py-4">
                    <View className="mb-2 flex-row items-center justify-between gap-3">
                      <CatalystText variant="label">追加ウェブサイト {index + 1}</CatalystText>
                      <CatalystIconButton
                        label={`追加ウェブサイト ${index + 1} を削除`}
                        size="sm"
                        tone="ghost"
                        onPress={() => handleRemoveWebsite(index)}
                        className="-mr-2 -my-2"
                      >
                        <UniTrash2 className="text-light-error dark:text-dark-error" />
                      </CatalystIconButton>
                    </View>
                    <CatalystTextField
                      value={w}
                      onChangeText={(value) => handleUpdateWebsite(index, value)}
                      placeholder="https://example.com"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      className="min-h-11 border-b border-light-divider bg-transparent px-0 py-1 text-[16px] dark:border-dark-divider"
                    />
                    {w.trim() && !isValidUrl(w) ? (
                      <CatalystText variant="caption" tone="danger" className="mt-2">
                        有効なURLを入力してください (http:// または https://)
                      </CatalystText>
                    ) : null}
                  </View>
                </View>
              ))}

              <View className="px-5 pb-5 pt-1">
                {additionalWebsites.length < MAX_ADDITIONAL_WEBSITES ? (
                  <CatalystButton tone="ghost" size="sm" onPress={handleAddWebsite} className="self-start px-0">
                    <CatalystButtonIcon>
                      <UniPlus className="text-light-tint dark:text-dark-tint" />
                    </CatalystButtonIcon>
                    <CatalystButtonText className="text-light-tint dark:text-dark-tint">
                      ウェブサイトを追加
                    </CatalystButtonText>
                  </CatalystButton>
                ) : null}
                {additionalWebsites.length > 0 ? (
                  <CatalystText variant="caption" tone="subtle" className="mt-2">
                    最大{MAX_ADDITIONAL_WEBSITES}件まで追加できます
                  </CatalystText>
                ) : null}
              </View>
            </ProfileEditSection>

            <View className="h-3" />

            <ProfileEditSection
              title="プロフィールハッシュタグ"
              caption="あなたの活動や好きなものを表すタグを追加できます。"
            >
              <View className="px-5 py-4">
                <View className="mb-3 flex-row items-center justify-between">
                  <CatalystText variant="label">タグ</CatalystText>
                  <CatalystText variant="caption" tone="muted">
                    {tags.length}/{PROFILE_TAG_MAX_COUNT}
                  </CatalystText>
                </View>

                {tags.length > 0 ? (
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {tags.map((tag) => (
                      <View
                        key={tag.id}
                        className="flex-row items-center gap-1.5 rounded-full border border-light-toggle-border bg-light-toggle px-3 py-1.5 dark:border-dark-toggle-border dark:bg-dark-toggle"
                      >
                        <CatalystText variant="caption" tone="tint" className="font-semibold">
                          #{tag.name}
                        </CatalystText>
                        <Pressable onPress={() => handleRemoveTag(tag.id)} hitSlop={6}>
                          <UniX size={12} className="text-light-text-muted dark:text-dark-text-muted" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <CatalystText variant="caption" tone="subtle" className="mb-3">
                    まだタグはありません。
                  </CatalystText>
                )}

                {tags.length < PROFILE_TAG_MAX_COUNT && (
                  <View>
                    <View className="flex-row items-end gap-3">
                      <CatalystTextField
                        value={tagInput}
                        onChangeText={handleTagInputChange}
                        onSubmitEditing={() => handleAddTag(tagInput)}
                        returnKeyType="done"
                        placeholder="タグを入力（# は任意）"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="min-h-11 flex-1 border-b border-light-divider bg-transparent px-0 py-1 text-[16px] dark:border-dark-divider"
                      />
                      <CatalystButton
                        onPress={() => handleAddTag(tagInput)}
                        disabled={!tagInput.trim()}
                        size="sm"
                        tone="tint"
                      >
                        <CatalystButtonText>追加</CatalystButtonText>
                      </CatalystButton>
                    </View>

                    {suggestions.length > 0 && (
                      <View className="mt-3 overflow-hidden rounded-lg border border-light-divider bg-light-background dark:border-dark-divider dark:bg-dark-surface-muted">
                        {suggestions.map((s, index) => (
                          <Pressable
                            key={s.id}
                            onPress={() => handleAddTag(s.name)}
                            className="flex-row items-center justify-between px-4 py-3 active:bg-light-surface-muted dark:active:bg-dark-background"
                          >
                            <CatalystText variant="label">#{s.name}</CatalystText>
                            <CatalystText variant="caption" tone="muted">
                              {s.usageCount.toLocaleString()} 人
                            </CatalystText>
                            {index + 1 !== suggestions.length ? (
                              <CatalystDivider className="absolute bottom-0 left-4 right-0 w-auto" />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                <CatalystButton
                  onPress={handleSaveTags}
                  disabled={isSavingTags}
                  tone="secondary"
                  className="mt-4"
                >
                  <CatalystButtonText>{isSavingTags ? "保存中..." : "タグを保存"}</CatalystButtonText>
                </CatalystButton>
              </View>
            </ProfileEditSection>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
      <EmojiPickerSheet
        ref={profileEmojiPickerRef}
        onEmojiSelected={handleProfileEmojiSelected}
        includeCatalystReactions={false}
      />
    </>
  );
}
