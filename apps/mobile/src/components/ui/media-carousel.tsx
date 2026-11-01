import { CatalystActionSheetItem, CatalystDivider, usePagerGestures } from "@/components/design-system";
import { MediaPinOverlay } from "@/components/status/media-pin-overlay";
import { MediaBadges } from "@/components/ui/media-badges";
import { useHaptics } from "@/hooks/use-haptics";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getCdnUrl, resolveDeliveredImageType } from "@/lib/media";
import { cn } from "@/lib/utils";
import { timelineImageQualityAtom, timelineWifiUpgradeAtom } from "@/models/atoms/image-quality";
import type { EpicleseReference } from "@/models/epiclese";
import { CatalystDownloader } from "@/models/image-downloader";
import type { Media } from "@/models/sdk-types";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import {
  ImageGallery,
  type CarouselIndicatorContext,
  type CarouselOverlayContext,
  type GalleryImage,
} from "@natsuneko-laboratory/react-native-carousel-viewer";
import NetInfo from "@react-native-community/netinfo";
import * as Sentry from "@sentry/react-native";
import { File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
  Album as MediaLibraryAlbum,
  Asset as MediaLibraryAsset,
  requestPermissionsAsync as requestMediaLibraryPermissions,
} from "expo-media-library";
import { useAtomValue } from "jotai";
import { Download, EyeOff, ImageDown, Share2 } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, Share, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import Toast from "react-native-toast-message";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);
const UniEyeOff = withUniwind(EyeOff);
const UniShare2 = withUniwind(Share2);
const UniDownload = withUniwind(Download);
const UniImageDown = withUniwind(ImageDown);

type Props = {
  medias: Media[];
  /** 投稿日時（ISO 8601）。保存時のファイル名に使う */
  createdAt: string;
  onIndexChange?: (index: number) => void;
  /** media.id → 写真上のピン（座標付きメタデータ）。渡された場合のみオーバーレイを表示する */
  pins?: Record<string, EpicleseReference[] | undefined>;
};

const SAVE_ALBUM_NAME = "Catalyst";

/**
 * 投稿日時とメディアの並び順からファイル名を組み立てる。保存順ではなく投稿順にソートできるよう投稿日時を使う。
 * variant は実際に保存した画質（"original" または Wi-Fi 設定に応じて変わる fullscreenVariant）をそのままサフィックスにする。
 * extension は CDN が実際に返したフォーマットに合わせる。
 */
const buildSavedFileName = (createdAt: string, media: Media, variant: string, extension: string) => {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // 投稿の最大枚数は10枚なので2桁ゼロパディングで揃える
  const order = pad(media.order + 1);
  return `Catalyst_${timestamp}_${order}_${variant}${extension}`;
};

/** 既定の保存先に作ってからアルバムへ移すと二度手間なので、アルバムがあれば最初からそこに作る */
const saveToPhotoLibrary = async (fileUri: string) => {
  const album = await MediaLibraryAlbum.get(SAVE_ALBUM_NAME);
  if (album) {
    await MediaLibraryAsset.create(fileUri, album);
    return;
  }

  const asset = await MediaLibraryAsset.create(fileUri);
  // アルバム作成に失敗しても写真自体は保存済みなので、保存失敗として扱わない
  await MediaLibraryAlbum.create(SAVE_ALBUM_NAME, [asset]).catch((e) => Sentry.captureException(e));
};

const ensureMediaLibraryPermission = async () => {
  const { status } = await requestMediaLibraryPermissions();
  if (status === "granted") return true;

  Alert.alert(
    "写真へのアクセスを許可してください",
    "画像を保存するには、端末の設定で Catalyst に写真へのアクセスを許可する必要があります。",
  );
  return false;
};

const getAspect = (media: Media) => ({
  w: media.metadata?.width ?? 1,
  h: media.metadata?.height ?? 1,
});

export const MediaCarousel = memo(({ medias, createdAt, onIndexChange, pins }: Props) => {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const theme = useColorScheme() ?? "light";
  const mediaIdentity = useMemo(() => medias.map((media) => media.id).join(":"), [medias]);
  const [isBlurRemoved, setIsBlurRemoved] = useState(false);
  const [arePinsVisible, setArePinsVisible] = useState(true);
  // Detail に表示中のページ。閉じている間は null（Carousel のスワイプで再レンダリングしないため）
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const imageActionsSheetRef = useRef<BottomSheet>(null);
  const actionTargetRef = useRef<{ media: Media; url: string; variant: "large" | "medium" } | null>(null);

  const imageQuality = useAtomValue(timelineImageQualityAtom);
  const wifiUpgrade = useAtomValue(timelineWifiUpgradeAtom);
  const haptics = useHaptics();
  const reducedMotion = useReducedMotion();
  // Inside the home tabs the carousel shares the horizontal axis with the tab pager. Block the
  // pager's gestures so a horizontal drag starting on several images never turns into a tab change
  // (#45). A single image has nothing to page, so the carousel leaves that drag to the pager (#60).
  const pagerGestures = usePagerGestures();
  const [isWifi, setIsWifi] = useState(false);

  useEffect(() => {
    NetInfo.fetch().then((state) => setIsWifi(state.type === "wifi"));
    return NetInfo.addEventListener((state) => setIsWifi(state.type === "wifi"));
  }, []);

  useEffect(() => {
    // FlashList can recycle timeline cells, so reset overlay state when a different post's media set is mounted.
    // The gallery itself is remounted via `key`.
    setIsBlurRemoved(false);
    setArePinsVisible(true);
    setDetailIndex(null);
    actionTargetRef.current = null;
  }, [mediaIdentity]);

  const timelineVariant = useMemo(() => {
    if (wifiUpgrade && isWifi) {
      return imageQuality === "low" ? "small" : "medium";
    }
    return imageQuality === "low" ? "timeline" : "small";
  }, [imageQuality, wifiUpgrade, isWifi]);

  // フルスクリーン表示はタイムラインの画質設定とは独立。Wi-Fi アップグレードのみを見て段階を上げる
  const fullscreenVariant = wifiUpgrade && isWifi ? "large" : "medium";

  const mediaById = useMemo(() => new Map(medias.map((media) => [media.id, media])), [medias]);

  const images = useMemo<GalleryImage[]>(
    () =>
      medias.map((media) => ({
        id: media.id,
        uri: getCdnUrl({
          src: media.url,
          variant: fullscreenVariant,
          width: SCREEN_WIDTH,
          aspect: getAspect(media),
        }),
        width: media.metadata?.width ?? undefined,
        height: media.metadata?.height ?? undefined,
      })),
    [medias, SCREEN_WIDTH, fullscreenVariant],
  );

  const doShareImage = useCallback(async () => {
    const target = actionTargetRef.current;
    if (!target) return;

    imageActionsSheetRef.current?.close();

    try {
      const file = await File.downloadFileAsync(target.url, Paths.cache, {
        idempotent: true,
      });
      await Share.share(Platform.OS === "ios" ? { url: file.uri } : { message: target.url });
    } catch (e) {
      Sentry.captureException(e);
      Toast.show({
        type: "error",
        text1: "画像を共有できませんでした",
        text2: "時間をおいて、もう一度お試しください",
      });
    }
  }, []);

  const doSaveImage = useCallback(
    async (quality: "current" | "original") => {
      const target = actionTargetRef.current;
      if (!target) return;

      imageActionsSheetRef.current?.close();

      // 画質は長押し時の値を見る。Wi-Fi の切り替わりでファイル名の画質サフィックスと中身がずれないようにするため
      const variant = quality === "original" ? "original" : target.variant;
      // 表示用 URL を使い回さず組み立て直す。保存では WebP を明示的に要求したいため。
      // ただし 8K 程度の大きな画像では CDN が変換せず JPEG を返すので、
      // 拡張子は要求ではなく実際に返ってきた中身に合わせる
      const url = getCdnUrl({
        src: target.media.url,
        variant,
        width: quality === "original" ? 9999 : SCREEN_WIDTH,
        aspect: quality === "original" ? undefined : getAspect(target.media),
        format: "webp",
      });

      try {
        // Android ではダウンロード・保存先への配置・完了通知・タップで開く動作をすべて OS に任せる。
        // ネイティブ側が無い環境（iOS）では下の写真ライブラリ経由にフォールバックする
        if (CatalystDownloader) {
          // Android 9 以前は公開ディレクトリへの書き込みに権限が要る。10 以降は OS が肩代わりする
          if (Number(Platform.Version) < 29 && !(await ensureMediaLibraryPermission())) return;

          // ダウンロードマネージャは保存先を先に決める必要があるので、ここだけ事前に型を問い合わせる
          const { extension, mimeType } = await resolveDeliveredImageType(url);
          const fileName = buildSavedFileName(createdAt, target.media, variant, extension);
          await CatalystDownloader.enqueueImageDownload(url, `${SAVE_ALBUM_NAME}/${fileName}`, mimeType);
          haptics.notification(Haptics.NotificationFeedbackType.Success);
          return;
        }

        if (!(await ensureMediaLibraryPermission())) return;

        const downloaded = await File.downloadFileAsync(url, Paths.cache, {
          idempotent: true,
        });
        // 取得済みのファイルから拡張子が分かるので、こちらは問い合わせ不要
        const destination = new File(
          Paths.cache,
          buildSavedFileName(createdAt, target.media, variant, downloaded.extension || ".jpg"),
        );
        // 同じ画像を再保存したとき、前回のキャッシュが残っていても失敗させない
        await downloaded.move(destination, { overwrite: true });

        try {
          await saveToPhotoLibrary(destination.uri);
          haptics.notification(Haptics.NotificationFeedbackType.Success);
        } finally {
          // 写真ライブラリに取り込んだ後の中間ファイルは不要。残すと次回の保存を邪魔する
          if (destination.exists) destination.delete();
        }
      } catch (e) {
        Sentry.captureException(e);
        Toast.show({
          type: "error",
          text1: "画像を保存できませんでした",
          text2: "時間をおいて、もう一度お試しください",
        });
      }
    },
    [haptics, createdAt, SCREEN_WIDTH],
  );

  const handleImageLongPress = useCallback(
    (index: number) => {
      const media = medias[index];
      const url = images[index]?.uri;
      if (!media || !url) return;

      // シートを開いている間に medias や画質設定が変わっても取り違えないよう、ここで対象を確定する
      haptics.impact(Haptics.ImpactFeedbackStyle.Heavy);
      actionTargetRef.current = { media, url, variant: fullscreenVariant };
      imageActionsSheetRef.current?.snapToIndex(0);
    },
    [haptics, medias, images, fullscreenVariant],
  );

  const renderImage = useCallback(
    (image: GalleryImage, { mode, index }: { mode: "carousel" | "detail"; index: number }) => {
      const media = mediaById.get(image.id);
      if (!media) return null;

      if (mode === "detail") {
        return (
          <UniImage
            recyclingKey={`${mediaIdentity}:${media.id}:modal`}
            source={{ uri: image.uri }}
            className="size-full"
            contentFit="contain"
            // ズームはビューのレイアウトサイズを変えない transform なので、ダウンスケールを許すと
            // 画面解像度のビットマップを拡大することになる。表示中のページだけ元解像度を保持する
            allowDownscaling={index !== detailIndex}
          />
        );
      }

      return (
        <View className="size-full bg-light-skeleton dark:bg-dark-skeleton">
          <UniImage
            recyclingKey={`${mediaIdentity}:${media.id}:timeline`}
            source={{
              uri: getCdnUrl({
                src: media.url,
                width: SCREEN_WIDTH,
                variant: timelineVariant,
                aspect: getAspect(media),
              }),
            }}
            className="size-full"
            contentFit="contain"
          />
        </View>
      );
    },
    [mediaById, mediaIdentity, SCREEN_WIDTH, timelineVariant, detailIndex],
  );

  const hasSensitiveContent = medias.some((m) => m.metadata?.isSensitive || m.metadata?.isSpoiler);
  const isSensitive = medias.some((m) => m.metadata?.isSensitive);
  const isSpoiler = medias.some((m) => m.metadata?.isSpoiler);
  const isBlurred = hasSensitiveContent && !isBlurRemoved;

  const renderCarouselOverlay = useCallback(
    ({ index, width, height, position }: CarouselOverlayContext) => {
      if (isBlurred) {
        return (
          <Pressable
            className="absolute inset-0 bg-light-skeleton dark:bg-dark-skeleton items-center justify-center gap-2"
            onPress={() => setIsBlurRemoved(true)}
          >
            <UniEyeOff size={28} className="text-white" />
            <Text className="text-white font-bold text-[17px]">Tap to view</Text>
            {isSensitive && <Text className="text-white/75 text-[13px]">センシティブコンテンツです</Text>}
            {isSpoiler && <Text className="text-white/75 text-[13px]">ネタバレ注意コンテンツです</Text>}
          </Pressable>
        );
      }

      // タイムラインではピンの座標を取っていないので、アイテム情報がある目印だけを、複数枚の目印と並べて右上に出す。
      // Web やプロフィールのグリッドと同じく投稿単位で見て、どれか 1 枚にでもあれば出す。
      // 押せない目印なので、カルーセルのスワイプやタップは邪魔しない。古い形式の投稿には hasReference が無いことがある
      if (!pins) {
        return <MediaBadges hasReference={medias.some((m) => m.hasReference)} hasMultiple={medias.length > 1} />;
      }

      // Photo pin overlay (座標付きメタデータ) — スワイプ中は前後の画像のピンも一緒に動かす
      return (
        <MediaPinOverlay
          medias={medias}
          pins={pins}
          index={index}
          position={position}
          width={width}
          height={height}
          visible={arePinsVisible}
          onToggleVisible={() => setArePinsVisible((v) => !v)}
        />
      );
    },
    [isBlurred, isSensitive, isSpoiler, medias, pins, arePinsVisible],
  );

  const renderCarouselIndicator = useCallback(
    ({ count, index, setIndex }: CarouselIndicatorContext) =>
      count > 1 ? (
        <View className="h-8 flex-row justify-center items-center">
          {Array.from({ length: count }, (_, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`画像 ${i + 1} / ${count}`}
              onPress={() => setIndex(i)}
              hitSlop={8}
              className={cn(
                "w-2 h-2 rounded-full p-1 mx-2",
                i === index ? "bg-light-tint dark:bg-dark-tint" : "bg-light-icon dark:bg-dark-icon",
              )}
            />
          ))}
        </View>
      ) : null,
    [],
  );

  const handleCloseDetail = useCallback(() => setDetailIndex(null), []);

  const handleIndexChange = useCallback(
    (index: number) => {
      // Detail を開いていないときは allowDownscaling に影響しないので、再レンダリングを避ける
      setDetailIndex((current) => (current === null ? null : index));
      onIndexChange?.(index);
    },
    [onIndexChange],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  // Image action bottom sheet - rendered inside the detail Modal (no portal) so it appears above it
  const renderDetailForeground = useCallback(
    () => (
      <BottomSheet
        ref={imageActionsSheetRef}
        index={-1}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: theme === "dark" ? "#1C1C1E" : "#FFFFFF",
        }}
        handleIndicatorStyle={{
          backgroundColor: theme === "dark" ? "#48484A" : "#C7C7CC",
        }}
      >
        <BottomSheetView className="pb-8">
          <CatalystActionSheetItem icon={UniShare2} title="画像を共有" onPress={doShareImage} tone="accent" />
          <CatalystDivider className="ml-14 w-auto" />
          <CatalystActionSheetItem icon={UniDownload} title="現在の画質で保存" onPress={() => doSaveImage("current")} />
          <CatalystDivider className="ml-14 w-auto" />
          <CatalystActionSheetItem icon={UniImageDown} title="最大画質で保存" onPress={() => doSaveImage("original")} />
        </BottomSheetView>
      </BottomSheet>
    ),
    [renderBackdrop, theme, doShareImage, doSaveImage],
  );

  if (medias.length === 0) return null;

  const firstMedia = medias[0];
  const maxHeight = SCREEN_HEIGHT / 2;
  const aspectRatio =
    firstMedia.metadata?.width && firstMedia.metadata?.height
      ? firstMedia.metadata.width / firstMedia.metadata.height
      : null;
  const carouselHeight = aspectRatio ? Math.min(SCREEN_WIDTH / aspectRatio, maxHeight) : maxHeight;

  return (
    <ImageGallery
      key={mediaIdentity}
      images={images}
      maxScale={5}
      doubleTapScale={3}
      longPressDuration={600}
      reduceMotion={reducedMotion}
      detailEnabled={!isBlurred}
      competingGestures={pagerGestures}
      style={{ height: carouselHeight, aspectRatio: undefined }}
      onIndexChange={handleIndexChange}
      onOpenDetail={setDetailIndex}
      onCloseDetail={handleCloseDetail}
      onLongPress={handleImageLongPress}
      renderImage={renderImage}
      renderCarouselOverlay={renderCarouselOverlay}
      renderCarouselIndicator={renderCarouselIndicator}
      renderDetailForeground={renderDetailForeground}
    />
  );
});
MediaCarousel.displayName = "MediaCarousel";
