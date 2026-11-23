import { ImageMetadataSection, type ImageMetadataEntry } from "@/components/compose/image-metadata-section";
import { ContestSelectorSheet, type ContestSelectorSheetRef } from "@/components/contest-selector-sheet";
import {
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystDivider,
  CatalystListItem,
  CatalystListItemContent,
  CatalystSwitch,
  CatalystText,
  CatalystTextField,
} from "@/components/design-system";
import { WeeklyThemeSelectorSheet, type WeeklyThemeSelectorSheetRef } from "@/components/theme/selector-sheet";
import { readImageMetadata, type ImageMetadataSummary } from "@/lib/image-metadata";
import { uploadImage, UnsupportedImageError } from "@/lib/media-upload";
import { accountAtom } from "@/models/atoms/account";
import type { CatalystContest, CatalystWeeklyTheme } from "@/models/sdk-types";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { CalendarDays, Check, Image as ImageIcon, Trophy, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { withUniwind } from "uniwind";

const UniImageIcon = withUniwind(ImageIcon);
const UniTrophy = withUniwind(Trophy);
const UniCalendarDays = withUniwind(CalendarDays);
const UniX = withUniwind(X);
const UniCheck = withUniwind(Check);

const MAX_CHARACTER_COUNT = 1000;
const MAX_IMAGE_COUNT = 10;

type SelectedImage = {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  metadataStatus: ImageMetadataEntry["status"];
  metadata: ImageMetadataSummary | null;
};

type Privacy = "public" | "quiet_public" | "followers" | "passphrase" | "private";

const PRIVACY_OPTIONS: { value: Privacy; label: string; description: string }[] = [
  { value: "public", label: "公開", description: "すべてのユーザーに公開されます" },
  { value: "quiet_public", label: "静かに公開", description: "公開されますが、タイムラインには表示されません" },
  { value: "followers", label: "フォロワー", description: "フォロワーのみに表示されます" },
  {
    value: "passphrase",
    label: "合言葉",
    description: "合言葉を知っている人だけが見られます。プロフィールとフォロワーのタイムラインには鍵付きで表示されます",
  },
  { value: "private", label: "非公開", description: "自分のみに表示されます" },
];

// サーバーと同じく、NFKC で正規化して前後の空白を除いた長さ (コードポイント数) で数える
const MAX_PASSPHRASE_LENGTH = 64;
const countPassphraseLength = (passphrase: string) => [...passphrase.normalize("NFKC").trim()].length;

export default function PostComposerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contest?: string | string[]; theme?: string | string[] }>();
  const account = useAtomValue(accountAtom);

  const [images, setImages] = useState<SelectedImage[]>([]);
  const [text, setText] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [passphrase, setPassphrase] = useState("");
  const [isNsfw, setIsNsfw] = useState(false);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isPrivateMetadata, setIsPrivateMetadata] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedContest, setSelectedContest] = useState<CatalystContest | null>(null);
  const [selectedWeeklyTheme, setSelectedWeeklyTheme] = useState<CatalystWeeklyTheme | null>(null);

  const contestSelectorRef = useRef<ContestSelectorSheetRef>(null);
  const weeklyThemeSelectorRef = useRef<WeeklyThemeSelectorSheetRef>(null);
  const contestSlug = Array.isArray(params.contest) ? params.contest[0] : params.contest;
  const themeSlug = Array.isArray(params.theme) ? params.theme[0] : params.theme;

  const characterCount = text.length;
  const isOverLimit = characterCount > MAX_CHARACTER_COUNT;
  const canAddMoreImages = images.length < MAX_IMAGE_COUNT;
  const isPassphrase = privacy === "passphrase";
  const passphraseLength = countPassphraseLength(passphrase);
  const isPassphraseValid = passphraseLength > 0 && passphraseLength <= MAX_PASSPHRASE_LENGTH;

  const canPost = useMemo(() => {
    if (isSubmitting || isOverLimit) return false;
    if (isPassphrase && !isPassphraseValid) return false;
    if (images.length > 0) return true;
    return text.trim().length > 0;
  }, [isSubmitting, isOverLimit, isPassphrase, isPassphraseValid, images.length, text]);

  const metadataEntries = useMemo<ImageMetadataEntry[]>(
    () => images.map(({ uri, metadataStatus, metadata }) => ({ uri, status: metadataStatus, metadata })),
    [images],
  );

  useEffect(() => {
    let ignore = false;

    const restoreContest = async () => {
      if (!account || !contestSlug || isPassphrase || selectedContest?.slug === contestSlug) return;

      const { data } = await account.credential.client.catalyst.v1.contest.by.slug.slug.get({
        path: { slug: contestSlug },
        throwOnError: true,
      });
      if (!ignore) {
        setSelectedContest(data.contest);
      }
    };

    restoreContest().catch((error) => {
      console.error("Failed to restore selected contest:", error);
    });

    return () => {
      ignore = true;
    };
  }, [account, contestSlug, isPassphrase, selectedContest?.slug]);

  useEffect(() => {
    let ignore = false;

    const restoreWeeklyTheme = async () => {
      if (!account || !themeSlug || isPassphrase || selectedWeeklyTheme?.slug === themeSlug) return;
      const weeklyThemes = account.credential.client.catalyst.v1.weeklyThemes;
      if (!weeklyThemes) return;

      const { data } = await weeklyThemes.by.slug.slug.get({
        path: { slug: themeSlug },
        throwOnError: true,
      });
      if (!ignore && data.theme.state === "open") {
        setSelectedWeeklyTheme(data.theme);
      }
    };

    restoreWeeklyTheme().catch((error) => {
      console.error("Failed to restore weekly theme:", error);
    });

    return () => {
      ignore = true;
    };
  }, [account, themeSlug, isPassphrase, selectedWeeklyTheme?.slug]);

  // 画像に VRChat / Resonite の撮影メタデータが埋め込まれているかは投稿するまで分からないため、
  // 選択直後にローカルで解析して投稿画面に表示する
  const analyzeMetadata = useCallback(async (uri: string) => {
    // 解析そのものは JS スレッド上で走るので、そのまま呼ぶとサムネイルや「解析中」の描画ごと
    // ブロックしてしまう。1 枚ごとにイベントループへ譲って、途中経過が画面に出るようにする
    await new Promise((resolve) => setTimeout(resolve, 0));

    const patch = (image: SelectedImage, next: Partial<SelectedImage>) =>
      image.uri === uri ? { ...image, ...next } : image;

    try {
      const metadata = await readImageMetadata(uri);
      setImages((prev) => prev.map((image) => patch(image, { metadataStatus: "analyzed", metadata })));
    } catch (error) {
      console.error("Failed to read image metadata:", error);
      setImages((prev) => prev.map((image) => patch(image, { metadataStatus: "failed", metadata: null })));
    }
  }, []);

  const handlePickImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGE_COUNT - images.length,
      // 埋め込まれたメタデータを保持したまま読み込むために、再エンコードを避ける
      quality: 1,
    });

    if (!result.canceled) {
      const newImages: SelectedImage[] = result.assets.map((asset) => ({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize ?? undefined,
        metadataStatus: "analyzing",
        metadata: null,
      }));
      setImages((prev) => [...prev, ...newImages].slice(0, MAX_IMAGE_COUNT));

      // 解析には画像 1 枚ぶんのバイト列をメモリに載せるので、まとめて投げず 1 枚ずつ順に進める
      void (async () => {
        for (const image of newImages) await analyzeMetadata(image.uri);
      })();
    }
  }, [images.length, analyzeMetadata]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canPost || !account) return;

    setIsSubmitting(true);

    try {
      const client = account.credential.client;
      const mediaList: { url: string; alt: string; width: number; height: number; bytes: number }[] = [];

      for (const image of images) {
        const file = new FileSystem.File(image.uri);
        const url = await uploadImage(client, await file.arrayBuffer());

        mediaList.push({
          url,
          alt: "",
          width: image.width,
          height: image.height,
          bytes: image.fileSize ?? 0,
        });
      }

      const { data: result } = await client.catalyst.v1.status.create({
        body: {
          description: text.trim(),
          isNsfw,
          isSpoiler,
          isSubmitToContest: selectedContest !== null,
          isSubmitToWeeklyTheme: selectedWeeklyTheme !== null,
          isHidingLikeAndViewCount: false,
          isPrivateMetadata,
          isAllowComments: true,
          privacy,
          // 正規化はサーバーが行うので、入力をそのまま送る
          passphrase: isPassphrase ? passphrase : undefined,
          contestId: selectedContest?.slug,
          weeklyThemeId: selectedWeeklyTheme?.slug,
          media: mediaList,
        },
        throwOnError: true,
      });

      router.dismiss();
      router.push(`/status/${result.id}`);
    } catch (error) {
      console.error("Failed to create status:", error);
      Toast.show({
        type: "error",
        text1: "エラー",
        text2: error instanceof UnsupportedImageError ? error.message : "投稿に失敗しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canPost,
    account,
    images,
    text,
    isNsfw,
    isSpoiler,
    isPrivateMetadata,
    privacy,
    isPassphrase,
    passphrase,
    selectedContest,
    selectedWeeklyTheme,
    router,
  ]);

  // 合言葉付きの投稿はコンテストにもお題にも参加できない
  const handlePrivacyChange = useCallback((value: Privacy) => {
    setPrivacy(value);
    if (value === "passphrase") {
      setSelectedContest(null);
      setSelectedWeeklyTheme(null);
    }
  }, []);

  const handleContestSelect = useCallback((contest: CatalystContest) => {
    setSelectedContest(contest);
  }, []);

  const handleWeeklyThemeSelect = useCallback((theme: CatalystWeeklyTheme) => {
    setSelectedWeeklyTheme(theme);
  }, []);

  // 挿入の仕方は Web 版に合わせている。本文が空でなければ改行してから末尾に足すだけで、
  // 既に同じタグが入っていても弾かない
  const handleInsertHashtag = useCallback((hashtag: string) => {
    setText((prev) => (prev ? `${prev}\n#${hashtag}` : `#${hashtag}`));
  }, []);

  const weeklyThemeHashtag = selectedWeeklyTheme?.hashtag ?? null;

  return (
    <>
      <ContestSelectorSheet ref={contestSelectorRef} onSelect={handleContestSelect} />
      <WeeklyThemeSelectorSheet ref={weeklyThemeSelectorRef} onSelect={handleWeeklyThemeSelect} />
      <Stack.Screen
        options={{
          title: "新しい投稿",
          headerBackTitle: "キャンセル",
          headerRight: () => (
            <Pressable onPress={handleSubmit} disabled={!canPost}>
              <CatalystText variant="subtitle" tone={canPost ? "accent" : "subtle"}>
                投稿
              </CatalystText>
            </Pressable>
          ),
        }}
      />
      <View className="flex-1 bg-light-surface-muted dark:bg-dark-background">
        {isSubmitting && (
          <View className="absolute inset-0 z-50 items-center justify-center bg-light-overlay dark:bg-dark-overlay">
            <ActivityIndicator size="large" />
          </View>
        )}
        <ScrollView className="flex-1" contentContainerClassName="pb-8">
          {/* 画像セクション */}
          <View className="pt-2">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              画像
            </CatalystText>
            <View className="bg-light-background dark:bg-dark-surface">
              {images.length > 0 && (
                <View className="flex-row flex-wrap gap-2 px-5 py-3">
                  {images.map((image, index) => (
                    <View key={image.uri} className="relative">
                      <Image source={{ uri: image.uri }} className="h-24 w-24 rounded-lg" resizeMode="cover" />
                      <Pressable
                        onPress={() => handleRemoveImage(index)}
                        className="absolute -right-1.5 -top-1.5 h-7 w-7 items-center justify-center rounded-full bg-black/65"
                      >
                        <UniX size={15} className="text-white" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {images.length > 0 && canAddMoreImages && <CatalystDivider className="ml-5 w-auto" />}
              {canAddMoreImages && (
                <View className="px-5 py-3">
                  <CatalystButton tone="secondary" onPress={handlePickImages}>
                    <CatalystButtonIcon>
                      <UniImageIcon />
                    </CatalystButtonIcon>
                    <CatalystButtonText>
                      画像を追加 ({images.length}/{MAX_IMAGE_COUNT})
                    </CatalystButtonText>
                  </CatalystButton>
                </View>
              )}
            </View>
            {images.length > 0 && (
              <CatalystText variant="caption" tone="subtle" className="px-5 pt-2 leading-4">
                最大10枚まで選択できます
              </CatalystText>
            )}
          </View>

          <ImageMetadataSection entries={metadataEntries} />

          {/* キャプションセクション */}
          <View className="mt-6">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              キャプション
            </CatalystText>
            <View className="bg-light-background px-5 py-3 dark:bg-dark-surface">
              <CatalystTextField
                value={text}
                onChangeText={setText}
                multiline
                placeholder="本文を入力..."
                className="min-h-24"
              />
            </View>
            <View className="flex-row items-start justify-between gap-4 px-5 pt-2">
              <CatalystText variant="caption" tone="subtle" className="flex-1 leading-4">
                {images.length === 0
                  ? "画像がない場合は本文が必須です"
                  : "画像に添えるキャプションを入力できます（任意）"}
              </CatalystText>
              <CatalystText variant="caption" tone={isOverLimit ? "danger" : "subtle"}>
                {characterCount} / {MAX_CHARACTER_COUNT}
              </CatalystText>
            </View>
          </View>

          {/* 閲覧設定セクション */}
          <View className="mt-6">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              閲覧設定
            </CatalystText>
            <View className="bg-light-background dark:bg-dark-surface">
              <View className="min-h-16 flex-row items-center px-5 py-3">
                <View className="mr-4 flex-1">
                  <CatalystText variant="subtitle" className="text-[15px] font-semibold">
                    NSFW コンテンツとしてマークする
                  </CatalystText>
                  <CatalystText variant="caption" tone="muted">
                    センシティブなコンテンツとして扱います
                  </CatalystText>
                </View>
                <CatalystSwitch value={isNsfw} onValueChange={setIsNsfw} />
              </View>
              <CatalystDivider className="ml-5 w-auto" />
              <View className="min-h-16 flex-row items-center px-5 py-3">
                <View className="mr-4 flex-1">
                  <CatalystText variant="subtitle" className="text-[15px] font-semibold">
                    スポイラーを有効にする
                  </CatalystText>
                  <CatalystText variant="caption" tone="muted">
                    ネタバレなどを伏せて表示します
                  </CatalystText>
                </View>
                <CatalystSwitch value={isSpoiler} onValueChange={setIsSpoiler} />
              </View>
            </View>
          </View>

          {/* プライバシーセクション */}
          <View className="mt-6">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              プライバシー
            </CatalystText>
            {/* 選択肢が 5 つあり、セグメントでは名前が収まらないので、説明付きの一覧から選ぶ */}
            <View className="bg-light-background dark:bg-dark-surface">
              {PRIVACY_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  <CatalystListItem
                    divided={false}
                    className="min-h-14 px-5 py-3"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: privacy === option.value }}
                    onPress={() => handlePrivacyChange(option.value)}
                  >
                    <CatalystListItemContent className="gap-0.5">
                      <CatalystText variant="subtitle" className="text-[15px] font-semibold">
                        {option.label}
                      </CatalystText>
                      <CatalystText variant="caption" tone="muted">
                        {option.description}
                      </CatalystText>
                    </CatalystListItemContent>
                    {privacy === option.value && <UniCheck size={18} className="text-light-tint dark:text-dark-tint" />}
                  </CatalystListItem>
                  {index < PRIVACY_OPTIONS.length - 1 && <CatalystDivider className="ml-5 w-auto" />}
                </View>
              ))}
            </View>
            {isPassphrase && (
              <>
                <View className="mt-3 bg-light-background px-5 py-3 dark:bg-dark-surface">
                  <CatalystText variant="subtitle" className="text-[15px] font-semibold">
                    合言葉
                  </CatalystText>
                  <CatalystTextField
                    value={passphrase}
                    onChangeText={setPassphrase}
                    placeholder="合言葉を入力"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    className="mt-1 min-h-10"
                  />
                </View>
                <View className="flex-row items-start justify-between gap-4 px-5 pt-2">
                  <CatalystText variant="caption" tone="subtle" className="flex-1 leading-4">
                    閲覧するときに入力してもらう合言葉です。大文字と小文字は区別されます
                  </CatalystText>
                  <CatalystText
                    variant="caption"
                    tone={passphraseLength > MAX_PASSPHRASE_LENGTH ? "danger" : "subtle"}
                  >
                    {passphraseLength} / {MAX_PASSPHRASE_LENGTH}
                  </CatalystText>
                </View>
              </>
            )}
            <View className="mt-3 min-h-16 flex-row items-center bg-light-background px-5 py-3 dark:bg-dark-surface">
              <View className="mr-4 flex-1">
                <CatalystText variant="subtitle" className="text-[15px] font-semibold">
                  メタデータを非表示
                </CatalystText>
                <CatalystText variant="caption" tone="muted">
                  画像に埋め込まれたメタデータを表示しません
                </CatalystText>
              </View>
              <CatalystSwitch value={isPrivateMetadata} onValueChange={setIsPrivateMetadata} />
            </View>
          </View>

          {/* コンテストセクション */}
          <View className="mt-6">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              コンテスト
            </CatalystText>
            {selectedContest ? (
              <View className="flex-row items-center gap-3 bg-light-background px-5 py-3 dark:bg-dark-surface">
                <UniTrophy size={18} className="text-light-toggle-icon dark:text-dark-toggle-icon" />
                <View className="flex-1">
                  <CatalystText variant="subtitle" className="text-[15px] font-semibold" numberOfLines={1}>
                    {selectedContest.title}
                  </CatalystText>
                  {selectedContest.theme ? (
                    <CatalystText variant="caption" tone="muted" numberOfLines={1}>
                      テーマ: {selectedContest.theme}
                    </CatalystText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setSelectedContest(null)}
                  className="h-6 w-6 items-center justify-center rounded-full bg-black/10 dark:bg-white/10"
                >
                  <UniX size={14} className="text-light-toggle-foreground dark:text-dark-toggle-foreground" />
                </Pressable>
              </View>
            ) : (
              <View className="bg-light-background px-5 py-3 dark:bg-dark-surface">
                <CatalystButton
                  tone="secondary"
                  disabled={isPassphrase}
                  onPress={() => contestSelectorRef.current?.open()}
                >
                  <CatalystButtonIcon>
                    <UniTrophy />
                  </CatalystButtonIcon>
                  <CatalystButtonText>
                    コンテストに参加する
                  </CatalystButtonText>
                </CatalystButton>
              </View>
            )}
            <CatalystText variant="caption" tone="subtle" className="px-5 pt-2 leading-4">
              {isPassphrase
                ? "合言葉付きの投稿はコンテストに参加できません。"
                : "コンテストに参加すると、この投稿がコンテストの応募作品として登録されます。"}
            </CatalystText>
          </View>

          {/* お題セクション */}
          <View className="mt-6">
            <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
              今週のお題
            </CatalystText>
            {selectedWeeklyTheme ? (
              <View className="bg-light-background px-5 py-3 dark:bg-dark-surface">
                <View className="flex-row items-center gap-3">
                  <UniCalendarDays size={18} className="text-light-toggle-icon dark:text-dark-toggle-icon" />
                  <View className="flex-1 gap-0.5">
                    <CatalystText variant="subtitle" className="text-[15px] font-semibold" numberOfLines={1}>
                      {selectedWeeklyTheme.title}
                    </CatalystText>
                    <CatalystText variant="caption" tone="muted" numberOfLines={1}>
                      この投稿で参加すると {selectedWeeklyTheme.points} ポイント獲得できます
                    </CatalystText>
                  </View>
                  <Pressable
                    onPress={() => setSelectedWeeklyTheme(null)}
                    className="h-6 w-6 items-center justify-center rounded-full bg-black/10 dark:bg-white/10"
                  >
                    <UniX size={14} className="text-light-toggle-foreground dark:text-dark-toggle-foreground" />
                  </Pressable>
                </View>
                {weeklyThemeHashtag ? (
                  <View className="mt-2 flex-row items-center justify-between gap-2">
                    <CatalystText variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                      推奨ハッシュタグ: {weeklyThemeHashtag}
                    </CatalystText>
                    <CatalystButton size="sm" tone="secondary" onPress={() => handleInsertHashtag(weeklyThemeHashtag)}>
                      <CatalystButtonText>本文に挿入</CatalystButtonText>
                    </CatalystButton>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="bg-light-background px-5 py-3 dark:bg-dark-surface">
                <CatalystButton
                  tone="secondary"
                  disabled={isPassphrase}
                  onPress={() => weeklyThemeSelectorRef.current?.open()}
                >
                  <CatalystButtonIcon>
                    <UniCalendarDays />
                  </CatalystButtonIcon>
                  <CatalystButtonText>お題に参加する</CatalystButtonText>
                </CatalystButton>
              </View>
            )}
            <CatalystText variant="caption" tone="subtle" className="px-5 pt-2 leading-4">
              {isPassphrase
                ? "合言葉付きの投稿はお題に参加できません。"
                : "お題への参加は週につき一度だけポイントが付与されます。"}
            </CatalystText>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
