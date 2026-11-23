/* eslint-disable react-hooks/immutability, react-hooks/refs, react-hooks/set-state-in-effect */
import { CatalystButton, CatalystButtonText, CatalystText, CatalystTextField } from "@/components/design-system";
import { EmojiPickerView } from "@/components/emoji-verse";
import { useDefaultCategories } from "@/components/emoji-verse/emoji-data";
import { FleetColorPickerButton, FleetColorPickerModal } from "@/components/fleet/color-picker-modal";
import { resolveStickerImageUrl } from "@/components/fleet/content";
import { uploadImage, UnsupportedImageError } from "@/lib/media-upload";
import { cn } from "@/lib/utils";
import { accountAtom } from "@/models/atoms/account";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import {
  FLEET_ASPECT_RATIO,
  FLEET_DEFAULT_BACKGROUND_COLORS,
  FLEET_DEFAULT_PLACEMENT,
  FLEET_FONTS,
  FLEET_MAX_STICKERS,
  FLEET_MAX_TEXTS,
  FLEET_MEDIA_SCALE_MAX,
  FLEET_MEDIA_SCALE_MIN,
  FLEET_TEXT_MAX_LENGTH,
  FLEET_TEXT_STICKER_SCALE_MAX,
  FLEET_TEXT_STICKER_SCALE_MIN,
  createContainerUnits,
  resolveFleetLayout,
  type ContainerUnits,
  type FleetContentData,
  type FleetPlacement,
  type FleetTextStyle,
  type ResolvedFleetTextLayer,
} from "@natsuneko-laboratory/fleet-renderer-react-native";
import { type EmojiCategory, type EmojiItem, emojiToCodepoints } from "@natsuneko-laboratory/react-native-emoji-verse";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { ImageIcon, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, Type, X } from "lucide-react-native";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { withUniwind } from "uniwind";

const UniImageIcon = withUniwind(ImageIcon);
const UniType = withUniwind(Type);
const UniX = withUniwind(X);
const UniPlus = withUniwind(Plus);
const UniPencil = withUniwind(Pencil);
const UniRotateCcw = withUniwind(RotateCcw);
const UniTrash2 = withUniwind(Trash2);
const UniTriangleAlert = withUniwind(TriangleAlert);

// ─── constants ───────────────────────────────────────────────────────────────

const TEXT_STYLE_OPTIONS: readonly { value: FleetTextStyle; label: string }[] = [
  { value: "default", label: "標準" },
  { value: "bold", label: "太字" },
  { value: "serif", label: "セリフ" },
  { value: "handwriting", label: "手書き" },
];

const TEXT_PLACEHOLDER = "テキストを入力...";
/** ステッカー編集ポップアップの「新規追加 (ステッカー未選択)」状態。それ以外は編集対象の id。 */
const STICKER_EDITOR_ADD = "new";
/**
 * プレビューでは文字・ステッカーの最小サイズ下限を無効にする。
 * 下限が効くとキャンバスを縮めたときにこれらだけ縮まらず、投稿結果と比率がずれるため
 * (実際のレンダリングは 1080x1920 なので下限には掛からない)。
 */
const PREVIEW_LAYOUT_OPTIONS = { minFontSizePx: 0, minStickerSizePx: 0 };
/** 編集ポップアップを開いている間にプレビュー側へ残す高さの割合 (ポップアップ側の上限と対になっている) */
const PREVIEW_RATIO_WHILE_EDITING = 0.45;
const DEFAULT_TEXT_COLOR = "#ffffff";
const TRANSPARENT = "transparent";

// ─── types ───────────────────────────────────────────────────────────────────

type SelectedImage = {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
};

type TextItem = {
  id: string;
  body: string;
  color: string;
  backgroundColor: string;
  textStyle: FleetTextStyle;
};

type StickerItem = {
  id: string;
  emoji: string;
};

type ReactionItem = {
  id?: string;
  symbol: string;
  name: string;
  url: string;
};

type ColorTarget = "background" | "textColor" | "textBackground";

// ─── helpers ─────────────────────────────────────────────────────────────────

const createId = () => `${Date.now()}-${Math.random()}`;

/**
 * テキスト・ステッカーの位置クランプ。Web 版と同じく中心だけを 0..1 に収めるので、
 * 端からはみ出した配置ができる。
 *
 * ponytail: fleet-renderer の `clampPlacementToCanvas` は外接矩形ごと収める別仕様で、
 * Web 版はそれを使っていない。パッケージ側で仕様が揃ったら差し替える。
 */
const clampLayerPlacement = (placement: FleetPlacement): FleetPlacement => {
  "worklet";
  return {
    ...placement,
    posX: Math.min(1, Math.max(0, placement.posX)),
    posY: Math.min(1, Math.max(0, placement.posY)),
  };
};

/**
 * 背景画像の位置クランプ。Web 版 (`CreateFleetForm`) と同じ式で、画像が常にキャンバスを
 * 覆う (キャンバスより小さいときは内側に収まる) 位置に留める。
 * 画像は幅 100% x scale で描かれるので、正規化した半幅は `scale / 2`、
 * 半高は `画像アスペクト x キャンバスアスペクト x scale / 2`。
 */
const createMediaClamp =
  (imageAspectRatio: number) =>
  (placement: FleetPlacement): FleetPlacement => {
    "worklet";
    const clampAxis = (value: number, half: number) =>
      Math.min(Math.max(value, Math.min(half, 1 - half)), Math.max(half, 1 - half));

    return {
      ...placement,
      posX: clampAxis(placement.posX, placement.scale / 2),
      posY: clampAxis(placement.posY, (imageAspectRatio * FLEET_ASPECT_RATIO * placement.scale) / 2),
    };
  };

/** -180..180 に丸め込む (回転ジェスチャーで何周しても値が発散しないように) */
const normalizeDegrees = (value: number) => {
  "worklet";
  return ((((value + 180) % 360) + 360) % 360) - 180;
};

// ─── ColorSwatch ─────────────────────────────────────────────────────────────

type ColorSwatchProps = {
  color: string;
  isSelected: boolean;
  onPress: () => void;
};

const ColorSwatch = ({ color, isSelected, onPress }: ColorSwatchProps) => (
  <Pressable
    accessibilityLabel={`色 ${color}`}
    onPress={onPress}
    className="size-7 rounded-full"
    style={{
      backgroundColor: color,
      borderWidth: isSelected ? 2.5 : 1,
      borderColor: isSelected ? "#888" : "rgba(128,128,128,0.4)",
    }}
  />
);

// ─── DraggableLayer ──────────────────────────────────────────────────────────

type TransformHandle = {
  getPlacement: () => FleetPlacement;
  /** 角度だけ 0 度に戻す (位置・大きさはそのまま)。指ではぴったり水平にできないため。 */
  resetRotation: () => void;
  /** 大きさだけ等倍に戻す (位置・角度はそのまま)。 */
  resetScale: () => void;
};

type DraggableLayerProps = {
  /**
   * 選択中かどうか。選択中のレイヤーだけがキャンバス全体を操作面として持ち、
   * 移動・ピンチ・回転を受け付ける (背景画像も「何も選択していないとき」の
   * 選択対象として同じ仕組みで扱う)。
   */
  isActive: boolean;
  /**
   * キャンバスの実サイズ (px)。shared value ではなく素の値で受けることで、
   * キャンバスが伸縮したときに文字サイズの再描画と変換行列の更新が同じフレームで起きる
   * (shared value を effect で同期すると 1 フレームずれてガタつく)。
   */
  containerWidth: number;
  containerHeight: number;
  scaleMin?: number;
  scaleMax?: number;
  /**
   * 操作中に位置を補正する worklet。Web 版と同じく常時クランプするので、
   * 指を離してから引き戻る動きは起きない。
   */
  clampPlacement: (placement: FleetPlacement) => FleetPlacement;
  /** 非選択時にタップまたはドラッグされたとき。未指定なら非選択時は一切反応しない (背景画像用)。 */
  onActivate?: () => void;
  /** 選択中にレイヤー自身がタップされたとき。 */
  onEdit?: () => void;
  /** 選択中にレイヤー外がタップされたとき。 */
  onDeactivate?: () => void;
  children: React.ReactNode;
};

/**
 * プレビュー上で移動・ピンチ (拡大縮小)・回転できるレイヤー。背景画像・テキスト・
 * ステッカーすべてがこれを使うので、どれを操作しても同じ操作感になる。
 * 位置・拡縮・回転は shared value が正で、ポップアップ側は `TransformHandle` 経由で読み書きする。
 */
const DraggableLayer = forwardRef<TransformHandle, DraggableLayerProps>(function DraggableLayer(
  {
    isActive,
    containerWidth,
    containerHeight,
    scaleMin = FLEET_TEXT_STICKER_SCALE_MIN,
    scaleMax = FLEET_TEXT_STICKER_SCALE_MAX,
    clampPlacement,
    onActivate,
    onEdit,
    onDeactivate,
    children,
  },
  ref,
) {
  // 位置は px ではなく正規化座標 (0..1) で持つ。プレビューが伸縮しても
  // 全レイヤーがキャンバスと同じ比率で追従し、投稿される位置とも常に一致する。
  const posX = useSharedValue<number>(FLEET_DEFAULT_PLACEMENT.posX);
  const posY = useSharedValue<number>(FLEET_DEFAULT_PLACEMENT.posY);
  const scale = useSharedValue<number>(FLEET_DEFAULT_PLACEMENT.scale);
  const rotation = useSharedValue<number>(FLEET_DEFAULT_PLACEMENT.rotation);
  const boxWidth = useSharedValue(0);
  const boxHeight = useSharedValue(0);

  const getPlacement = useCallback((): FleetPlacement => {
    return clampPlacement({ posX: posX.value, posY: posY.value, scale: scale.value, rotation: rotation.value });
  }, [clampPlacement, posX, posY, scale, rotation]);

  /** 操作のたびに位置を許容範囲へ収める (Web 版と同じく常時クランプ)。 */
  const applyClamp = () => {
    "worklet";
    const clamped = clampPlacement({
      posX: posX.value,
      posY: posY.value,
      scale: scale.value,
      rotation: rotation.value,
    });
    posX.value = clamped.posX;
    posY.value = clamped.posY;
  };

  useImperativeHandle(ref, () => ({
    getPlacement,
    resetRotation: () => {
      rotation.value = withTiming(FLEET_DEFAULT_PLACEMENT.rotation, { duration: 150 });
    },
    resetScale: () => {
      scale.value = withTiming(FLEET_DEFAULT_PLACEMENT.scale, { duration: 150 });

      // 等倍に戻すとクランプの許容範囲も変わるので、位置も合わせ直す
      const clamped = clampPlacement({
        posX: posX.value,
        posY: posY.value,
        scale: FLEET_DEFAULT_PLACEMENT.scale,
        rotation: rotation.value,
      });
      posX.value = withTiming(clamped.posX, { duration: 150 });
      posY.value = withTiming(clamped.posY, { duration: 150 });
    },
  }));

  const panGesture = Gesture.Pan()
    // Android の既定は「最後に触れた指」を追う。2 本指で広げたときに
    // その指の移動ぶんだけオブジェクトがずれてしまうので、重心追従にする
    .averageTouches(true)
    .onStart(() => {
      // 掴んで動かし始めた時点で選択する (「選択してから動かす」の 1 タップを省く)。
      // タップ判定を過ぎてから呼ぶので、ただ触れただけでは選択が変わらない
      if (!isActive && onActivate) runOnJS(onActivate)();
    })
    .onChange((e) => {
      if (containerWidth === 0 || containerHeight === 0) return;
      posX.value += e.changeX / containerWidth;
      posY.value += e.changeY / containerHeight;
      applyClamp();
    });

  // 拡縮・回転は「2 本指の中点 (焦点) を固定したまま」動かす。
  // 写真ビューアやストーリーのスタンプ編集と同じで、指の下のものが指から逃げない。
  const pinchGesture = Gesture.Pinch().onChange((e) => {
    if (containerWidth === 0 || containerHeight === 0) return;

    const next = Math.min(scaleMax, Math.max(scaleMin, scale.value * e.scaleChange));
    const applied = next / scale.value;
    const focalX = e.focalX / containerWidth;
    const focalY = e.focalY / containerHeight;

    posX.value = focalX + (posX.value - focalX) * applied;
    posY.value = focalY + (posY.value - focalY) * applied;
    scale.value = next;
    applyClamp();
  });

  const rotationGesture = Gesture.Rotation().onChange((e) => {
    if (containerWidth === 0 || containerHeight === 0) return;

    const anchorX = e.anchorX / containerWidth;
    const anchorY = e.anchorY / containerHeight;
    // 回転は等方なので、いったん px に戻してから回す
    const offsetXPx = (posX.value - anchorX) * containerWidth;
    const offsetYPx = (posY.value - anchorY) * containerHeight;
    const cos = Math.cos(e.rotationChange);
    const sin = Math.sin(e.rotationChange);

    posX.value = anchorX + (offsetXPx * cos - offsetYPx * sin) / containerWidth;
    posY.value = anchorY + (offsetXPx * sin + offsetYPx * cos) / containerHeight;
    rotation.value = normalizeDegrees(rotation.value + (e.rotationChange * 180) / Math.PI);
    applyClamp();
  });

  /** タップ位置がレイヤー自身の上かどうか (選択中は操作面がキャンバス全体になるため必要)。 */
  const isPointOnLayer = (x: number, y: number) => {
    "worklet";
    return (
      Math.abs(x - posX.value * containerWidth) <= (boxWidth.value * scale.value) / 2 &&
      Math.abs(y - posY.value * containerHeight) <= (boxHeight.value * scale.value) / 2
    );
  };

  const tapGesture = Gesture.Tap().onEnd((e) => {
    if (!isActive) {
      if (onActivate) runOnJS(onActivate)();
      return;
    }

    // レイヤー自身をタップしたときは選択を維持する (選択したまま拡縮したいことが多い)
    if (onDeactivate && !isPointOnLayer(e.x, e.y)) runOnJS(onDeactivate)();
  });

  // 編集は長押しで開く。選択中はキャンバス全体が操作面なので、
  // タップで開くと移動のつもりが編集になってしまうことがあるため
  const longPressGesture = Gesture.LongPress()
    .minDuration(350)
    .onStart((e) => {
      if (!isActive) {
        if (onEdit) runOnJS(onEdit)();
        return;
      }

      // 選択中の操作面はキャンバス全体を覆うので、別レイヤーの上を長押しした場合もここに来る。
      // 無反応だと手詰まりに見えるため、外したときはタップと同じく選択解除にする
      if (isPointOnLayer(e.x, e.y)) {
        if (onEdit) runOnJS(onEdit)();
      } else if (onDeactivate) {
        runOnJS(onDeactivate)();
      }
    });

  // GestureDetector に渡すジェスチャーの構成は固定し、有効・無効だけ切り替える
  // (構成ごと差し替えると再アタッチが走って挙動が不安定になるため)
  const composedGesture = Gesture.Simultaneous(
    // 移動は非選択でも受け付ける (掴んだ時点で選択される)。
    // ピンチ・回転は操作面がキャンバス全体に広がる選択中のみ
    panGesture,
    pinchGesture.enabled(isActive),
    rotationGesture.enabled(isActive),
    Gesture.Exclusive(longPressGesture, tapGesture),
  );

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateX: (posX.value - 0.5) * containerWidth },
        { translateY: (posY.value - 0.5) * containerHeight },
        { scale: scale.value },
        { rotate: `${rotation.value}deg` },
      ],
    }),
    [containerWidth, containerHeight],
  );

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      boxWidth.value = e.nativeEvent.layout.width;
      boxHeight.value = e.nativeEvent.layout.height;
    },
    [boxWidth, boxHeight],
  );

  // 選択状態で JSX の形を変えると中身が作り直されて画像がちらつくので、
  // 木構造は固定したまま「ジェスチャーと当たり判定の広さ」だけ差し替える。
  // 選択中は操作面をキャンバス全体に広げる (レイヤー自身だけを操作面にすると、
  // 2 本指の片方がレイヤーの外に落ちてピンチ・回転が成立しないため)
  return (
    <GestureDetector gesture={composedGesture}>
      <View
        pointerEvents={isActive ? "auto" : onActivate ? "box-none" : "none"}
        className="absolute inset-0 items-center justify-center"
      >
        <Animated.View style={animatedStyle}>
          <View onLayout={handleLayout}>{children}</View>
          {isActive && <View pointerEvents="none" style={selectionOutlineStyle} />}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

/** 選択中のレイヤーを示す枠。レイアウトに影響しないよう絶対配置で重ねる。 */
const selectionOutlineStyle = {
  borderColor: "rgba(232, 121, 160, 0.75)",
  borderRadius: 6,
  borderStyle: "dashed",
  borderWidth: 1,
  bottom: -3,
  left: -3,
  position: "absolute",
  right: -3,
  top: -3,
} as const;

// ─── layer styles (viewer と同じ見た目にするためのマッピング) ─────────────────

/**
 * `resolveFleetLayout` のテキスト背景 (余白・角丸) には px の下限が入っていて、
 * `minFontSizePx` のようにオプションで外せない。プレビューを縮めたときここだけ
 * 縮まらず背景ピルが太って見えるので、同じ式を下限なしで計算し直して上書きする。
 *
 * ponytail: fleet-renderer 側で余白・角丸の下限をオプション化できたら、
 * この関数の `units` 引数ごと削除して `layer.paddingVerticalPx` などに戻す。
 */
const toTextLayerStyle = (layer: ResolvedFleetTextLayer, units: ContainerUnits) => ({
  backgroundColor: layer.backgroundColor,
  borderRadius: units.cqw(1.5),
  color: layer.color,
  fontFamily: layer.font.reactNativeFontFamily,
  fontSize: layer.fontSizePx,
  lineHeight: layer.lineHeightPx,
  maxWidth: layer.maxWidthPx,
  paddingHorizontal: units.cqw(3.2),
  paddingVertical: units.cqh(1.2),
  textAlign: layer.textAlignment,
  textShadowColor: "rgba(0, 0, 0, 0.45)",
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 6,
});

// ─── EditorSheet ─────────────────────────────────────────────────────────────

type EditorSheetProps = {
  visible: boolean;
  /** プレビューを隠しきらないための上限。PREVIEW_RATIO_WHILE_EDITING と対になる。 */
  maxHeight: number;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * 画面下から出る編集ポップアップの外枠。
 * Modal は別ウィンドウなので、中の ScrollView / ジェスチャーを効かせるには
 * GestureHandlerRootView を張り直す必要がある。
 */
const EditorSheet = ({ visible, maxHeight, onClose, children }: EditorSheetProps) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <GestureHandlerRootView className="flex-1">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="rounded-t-2xl bg-light-surface-elevated dark:bg-dark-surface-elevated" style={{ maxHeight }}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </Modal>
);

// ─── FleetComposerScreen ─────────────────────────────────────────────────────

export default function FleetComposerScreen() {
  const theme = useColorScheme() ?? "light";
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const account = useAtomValue(accountAtom);
  const insets = useSafeAreaInsets();

  const [image, setImage] = useState<SelectedImage | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<string>("#000000");
  const [isNsfw, setIsNsfw] = useState(false);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stickerEditor, setStickerEditor] = useState<string | null>(null);
  const [colorTarget, setColorTarget] = useState<ColorTarget | null>(null);
  const [activeLayer, setActiveLayer] = useState<{ kind: "text" | "sticker"; id: string } | null>(null);
  // 追加直後だけキーボードを自動で開く (既存テキストは色・スタイルだけ変えたいことが多いため)
  const [isAddingText, setIsAddingText] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetContentHeight, setSheetContentHeight] = useState(0);
  const [previewArea, setPreviewArea] = useState({ width: 0, height: 0 });
  const [availableReactions, setAvailableReactions] = useState<ReactionItem[]>([]);
  const [isLoadingReactions, setIsLoadingReactions] = useState(false);
  const defaultEmojiCategories = useDefaultCategories();

  const textRefsMap = useRef<Map<string, TransformHandle | null>>(new Map());
  const stickerRefsMap = useRef<Map<string, TransformHandle | null>>(new Map());
  const mediaRef = useRef<TransformHandle | null>(null);

  // 編集ポップアップを開いている間は、プレビュー全体が上に収まるよう領域を狭める
  const isEditorOpen = editingTextId !== null || stickerEditor !== null || colorTarget !== null;
  const editorMaxHeight = windowHeight * (1 - PREVIEW_RATIO_WHILE_EDITING);
  // 画面が短いと windowHeight 基準の余白が使える領域を食い潰してプレビューが消えるので、
  // プレビュー側には必ず領域の PREVIEW_RATIO_WHILE_EDITING を残す
  const previewPaddingBottom = isEditorOpen
    ? Math.min(editorMaxHeight, previewArea.height * (1 - PREVIEW_RATIO_WHILE_EDITING))
    : sheetContentHeight;

  // キャンバスの「レイアウト上の」サイズはポップアップの開閉で変えない。
  // サイズを変えると文字サイズ・余白 (React の再描画) と位置 (Reanimated の変換行列) の
  // 更新タイミングが噛み合わず、レイヤーがずれて見えるため。
  // 狭いときは transform の scale だけで縮める = 全レイヤーが完全に同じ比率で縮む。
  const canvasWidth = Math.min(
    previewArea.width,
    Math.max(0, previewArea.height - sheetContentHeight) * FLEET_ASPECT_RATIO,
  );
  const canvasHeight = canvasWidth / FLEET_ASPECT_RATIO;
  const previewAvailableHeight = Math.max(0, previewArea.height - previewPaddingBottom);
  const previewScale = canvasHeight > 0 ? Math.min(1, previewAvailableHeight / canvasHeight) : 1;
  // カラーピッカーのドラッグ中は UI スレッドから直接これらを書き換えてプレビューへ即反映する
  // (React の state 更新を挟まないので、指の動きに遅れずに追従する)
  const previewBackgroundColor = useSharedValue(backgroundColor);
  const previewBackgroundStyle = useAnimatedStyle(() => ({ backgroundColor: previewBackgroundColor.value }));
  const previewTextColor = useSharedValue<string>(DEFAULT_TEXT_COLOR);
  const previewTextBackgroundColor = useSharedValue<string>(TRANSPARENT);
  const previewTextStyle = useAnimatedStyle(() => ({
    backgroundColor: previewTextBackgroundColor.value,
    color: previewTextColor.value,
  }));

  useEffect(() => {
    previewBackgroundColor.value = backgroundColor;
  }, [backgroundColor, previewBackgroundColor]);

  /** いま操作対象になっているレイヤー (何も選択していなければ背景画像)。 */
  const activeHandle = useCallback(() => {
    if (activeLayer === null) return mediaRef.current;
    const refs = activeLayer.kind === "text" ? textRefsMap : stickerRefsMap;
    return refs.current.get(activeLayer.id) ?? null;
  }, [activeLayer]);

  const activeLayerLabel = activeLayer === null ? "画像" : activeLayer.kind === "text" ? "テキスト" : "ステッカー";

  const canPost = !isSubmitting && image !== null;
  const editingText = texts.find((item) => item.id === editingTextId) ?? null;
  const editingSticker =
    stickerEditor !== null && stickerEditor !== STICKER_EDITOR_ADD
      ? (stickers.find((item) => item.id === stickerEditor) ?? null)
      : null;

  const reactionUrlMap = useMemo(
    () => Object.fromEntries(availableReactions.map((reaction) => [reaction.symbol, reaction.url])),
    [availableReactions],
  );

  useEffect(() => {
    if (stickerEditor === null || availableReactions.length > 0) return;

    let active = true;
    setIsLoadingReactions(true);

    fetch("https://api.natsuneko.com/catalyst/v1/reactions")
      .then((response) => response.json() as Promise<ReactionItem[]>)
      .then((reactions) => {
        if (!active) return;
        setAvailableReactions(reactions);
      })
      .catch((error) => {
        console.error("Failed to load teyvat reactions:", error);
        if (active) {
          Toast.show({ type: "error", text1: "エラー", text2: "ステッカーの読み込みに失敗しました" });
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingReactions(false);
        }
      });

    return () => {
      active = false;
    };
  }, [stickerEditor, availableReactions.length]);

  const stickerCategories = useMemo<EmojiCategory[]>(() => {
    const categories: EmojiCategory[] = [];

    if (availableReactions.length > 0) {
      categories.push({
        id: "catalyst",
        title: "Catalyst",
        icon: "star",
        emojis: availableReactions.map((reaction): EmojiItem => ({
          id: reaction.symbol,
          type: { kind: "url", url: reaction.url },
          keywords: [reaction.name, reaction.symbol],
        })),
      });
    }

    categories.push(...defaultEmojiCategories);

    return categories;
  }, [availableReactions, defaultEmojiCategories]);

  // ── preview layout ──────────────────────────────────────────────────────────
  // 投稿後の描画 (FleetCanvas) と同じレイアウト計算を使うことで、
  // プレビューと投稿結果でフォントサイズや画像の拡縮がずれないようにする。
  const draft = useMemo<FleetContentData>(
    () => ({
      // 背景色はレイアウト計算に影響しないので、ここには含めず再計算のトリガーにしない
      backgroundColor: "#000000",
      media: image ? { url: image.uri, width: image.width, height: image.height } : null,
      texts: texts.map((item) => ({
        ...FLEET_DEFAULT_PLACEMENT,
        id: item.id,
        body: item.body,
        textStyle: item.textStyle,
        textAlignment: "center" as const,
        color: item.color,
        backgroundColor: item.backgroundColor,
      })),
      stickers: stickers.map((item) => ({
        ...FLEET_DEFAULT_PLACEMENT,
        id: item.id,
        emoji: item.emoji,
        imageUrl: reactionUrlMap[item.emoji],
      })),
    }),
    [image, texts, stickers, reactionUrlMap],
  );

  // Web 版と同じ「画像が常にキャンバスを覆う」クランプ
  const clampMediaPlacement = useMemo(
    () => createMediaClamp(image && image.width > 0 ? image.height / image.width : 1),
    [image],
  );

  const containerUnits = useMemo(
    () => createContainerUnits({ width: canvasWidth, height: canvasHeight }),
    [canvasWidth, canvasHeight],
  );

  const layout = useMemo(
    () => resolveFleetLayout(draft, { width: canvasWidth, height: canvasHeight }, PREVIEW_LAYOUT_OPTIONS),
    [draft, canvasWidth, canvasHeight],
  );

  // ── handlers ────────────────────────────────────────────────────────────────
  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    // 稀に幅・高さが取れない端末・形式がある。0 のままだとレイアウト計算が壊れて
    // プレビューが真っ白になり、投稿もスキーマ (width/height >= 1) に弾かれる
    if (asset.width <= 0 || asset.height <= 0) {
      Toast.show({ type: "error", text1: "エラー", text2: "この画像のサイズを取得できませんでした" });
      return;
    }

    // 画像を差し替えると DraggableLayer が key で作り直され、拡縮・位置も初期化される
    setImage({ uri: asset.uri, width: asset.width, height: asset.height, fileSize: asset.fileSize ?? undefined });
    setActiveLayer(null);
  }, []);

  const updateText = useCallback((id: string, patch: Partial<TextItem>) => {
    setTexts((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const handleDeleteText = useCallback((id: string) => {
    setTexts((prev) => prev.filter((item) => item.id !== id));
    textRefsMap.current.delete(id);
    setActiveLayer((prev) => (prev?.kind === "text" && prev.id === id ? null : prev));
  }, []);

  // Web 版と同じく、追加した時点でプレビューに載せてそのまま編集する
  const openAddText = useCallback(() => {
    const id = createId();
    setTexts((prev) => [
      ...prev,
      { id, body: "", color: DEFAULT_TEXT_COLOR, backgroundColor: TRANSPARENT, textStyle: "default" },
    ]);
    previewTextColor.value = DEFAULT_TEXT_COLOR;
    previewTextBackgroundColor.value = TRANSPARENT;
    setEditingTextId(id);
    setIsAddingText(true);
    setActiveLayer({ kind: "text", id });
  }, [previewTextColor, previewTextBackgroundColor]);

  /** 編集ポップアップを開く。プレビュー追従用の色も同時に合わせる (effect だと 1 フレーム遅れる)。 */
  const openTextEditor = useCallback(
    (item: TextItem) => {
      previewTextColor.value = item.color;
      previewTextBackgroundColor.value = item.backgroundColor;
      setEditingTextId(item.id);
      setIsAddingText(false);
    },
    [previewTextColor, previewTextBackgroundColor],
  );

  /** 空文字のまま閉じられたテキストは残しても意味がないので取り除く。 */
  const closeTextEditor = useCallback(() => {
    if (editingTextId !== null) {
      const item = texts.find((text) => text.id === editingTextId);
      if (item && item.body.trim().length === 0) handleDeleteText(editingTextId);
    }
    setEditingTextId(null);
    setIsAddingText(false);
  }, [editingTextId, texts, handleDeleteText]);

  const handleDeleteSticker = useCallback((id: string) => {
    setStickers((prev) => prev.filter((sticker) => sticker.id !== id));
    stickerRefsMap.current.delete(id);
    setActiveLayer((prev) => (prev?.kind === "sticker" && prev.id === id ? null : prev));
  }, []);

  const handleSelectSticker = useCallback(
    (emoji: EmojiItem) => {
      // URL が無くても resolveStickerImageUrl が symbol から組み立てられるので、
      // ここでは symbol を取り出すだけでよい
      const e = emoji.type;
      const symbol =
        e.kind === "unicode"
          ? emojiToCodepoints(e.emoji)
          : e.url.substring(e.url.lastIndexOf("/") + 1, e.url.lastIndexOf("."));

      if (stickerEditor !== null && stickerEditor !== STICKER_EDITOR_ADD) {
        setStickers((prev) =>
          prev.map((sticker) => (sticker.id === stickerEditor ? { ...sticker, emoji: symbol } : sticker)),
        );
        return;
      }

      // 追加時は選択した時点で確定して閉じる (Web 版と同じ挙動)
      const id = createId();
      setStickers((prev) => [...prev, { id, emoji: symbol }]);
      setActiveLayer({ kind: "sticker", id });
      setStickerEditor(null);
    },
    [stickerEditor],
  );

  const handleSubmit = useCallback(async () => {
    if (!canPost || !account || !image) return;
    setIsSubmitting(true);
    try {
      const client = account.credential.client;
      const file = new FileSystem.File(image.uri);
      const mediaUrl = await uploadImage(client, await file.arrayBuffer());

      const textPayload = texts
        .filter((item) => item.body.trim().length > 0)
        .map((item) => {
          const p = textRefsMap.current.get(item.id)?.getPlacement() ?? FLEET_DEFAULT_PLACEMENT;
          return {
            body: item.body,
            textStyle: item.textStyle,
            textAlignment: "center" as const,
            color: item.color,
            backgroundColor: item.backgroundColor,
            posX: p.posX,
            posY: p.posY,
            scale: p.scale,
            rotation: p.rotation,
          };
        });

      const stickerPayload = stickers.map((sticker) => {
        const p = stickerRefsMap.current.get(sticker.id)?.getPlacement() ?? FLEET_DEFAULT_PLACEMENT;
        return {
          emoji: sticker.emoji,
          posX: p.posX,
          posY: p.posY,
          scale: p.scale,
          rotation: p.rotation,
        };
      });

      await client.catalyst.v1.fleet.create({
        body: {
          backgroundColor,
          isNsfw,
          media: {
            url: mediaUrl,
            width: image.width,
            height: image.height,
            bytes: image.fileSize ?? 0,
            placement: mediaRef.current?.getPlacement() ?? FLEET_DEFAULT_PLACEMENT,
          },
          texts: textPayload,
          stickers: stickerPayload,
        },
        throwOnError: true,
      });

      router.dismiss();
      Toast.show({ type: "success", text1: "フリートを投稿しました" });
    } catch (error) {
      console.error("Failed to create fleet:", error);
      Toast.show({
        type: "error",
        text1: "エラー",
        text2: error instanceof UnsupportedImageError ? error.message : "フリートの投稿に失敗しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [canPost, account, image, backgroundColor, isNsfw, texts, stickers, router]);

  // ── color picker ────────────────────────────────────────────────────────────
  const resolveColorPicker = () => {
    switch (colorTarget) {
      case "background":
        return {
          title: "背景色",
          value: backgroundColor,
          swatches: FLEET_DEFAULT_BACKGROUND_COLORS,
          liveColor: previewBackgroundColor,
          onChange: setBackgroundColor,
          onSelectTransparent: undefined,
        };

      case "textColor":
        return {
          title: "文字色",
          value: editingText?.color ?? DEFAULT_TEXT_COLOR,
          swatches: undefined,
          liveColor: previewTextColor,
          onChange: (color: string) => editingText && updateText(editingText.id, { color }),
          onSelectTransparent: undefined,
        };

      case "textBackground":
        return {
          title: "テキストの背景色",
          value: editingText?.backgroundColor ?? TRANSPARENT,
          swatches: undefined,
          liveColor: previewTextBackgroundColor,
          onChange: (color: string) => editingText && updateText(editingText.id, { backgroundColor: color }),
          onSelectTransparent: () => {
            if (editingText) updateText(editingText.id, { backgroundColor: TRANSPARENT });
            // 編集中のテキストはライブ値で描いているので、こちらも戻さないと色が残る
            previewTextBackgroundColor.value = TRANSPARENT;
            setColorTarget(null);
          },
        };

      default:
        return null;
    }
  };

  const colorPicker = resolveColorPicker();
  const colorPickerModal = colorPicker && (
    <FleetColorPickerModal
      visible
      title={colorPicker.title}
      value={colorPicker.value}
      swatches={colorPicker.swatches}
      onChange={colorPicker.onChange}
      liveColor={colorPicker.liveColor}
      onSelectTransparent={colorPicker.onSelectTransparent}
      onClose={() => setColorTarget(null)}
    />
  );

  const sheetBg = theme === "dark" ? "#1C1C1E" : "#FFFFFF";
  const handleColor = theme === "dark" ? "#48484A" : "#C7C7CC";

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen
        options={{
          title: "Fleet",
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

        {/* Preview */}
        <View className="flex-1 px-4">
          {/* 実測するのは余白を含まない最大領域だけ。ここは編集の開閉で変わらないので再計測も起きない */}
          <View className="flex-1" onLayout={(e) => setPreviewArea(e.nativeEvent.layout)}>
            {/* ポップアップぶんの余白はマージンで与える (親の実測値を動かさないため) */}
            <View className="flex-1 items-center justify-center" style={{ marginBottom: previewPaddingBottom }}>
              {/* 投稿結果 (FleetCanvas) は角丸を付けないので、プレビューも付けない。
                  overflow-hidden ははみ出したレイヤーを切るために残す */}
              <View
                className="overflow-hidden"
                style={{ width: canvasWidth, height: canvasHeight, transform: [{ scale: previewScale }] }}
              >
                <Animated.View pointerEvents="none" className="absolute inset-0" style={previewBackgroundStyle} />

                {image && layout.media ? (
                  <DraggableLayer
                    key={image.uri}
                    ref={mediaRef}
                    isActive={activeLayer === null}
                    containerWidth={canvasWidth}
                    containerHeight={canvasHeight}
                    scaleMin={FLEET_MEDIA_SCALE_MIN}
                    scaleMax={FLEET_MEDIA_SCALE_MAX}
                    clampPlacement={clampMediaPlacement}
                  >
                    <Image
                      source={{ uri: image.uri }}
                      style={{ width: layout.media.widthPx, height: layout.media.heightPx }}
                      contentFit="cover"
                    />
                  </DraggableLayer>
                ) : (
                  <Pressable onPress={handlePickImage} className="flex-1 items-center justify-center gap-2">
                    <UniImageIcon size={40} className="text-light-icon dark:text-dark-icon" />
                    <CatalystText tone="muted">タップして画像を選択</CatalystText>
                  </Pressable>
                )}

                {texts.map((item, index) => {
                  const layer = layout.texts[index];
                  if (!layer) return null;

                  return (
                    <DraggableLayer
                      key={item.id}
                      ref={(r) => {
                        textRefsMap.current.set(item.id, r);
                      }}
                      containerWidth={canvasWidth}
                      containerHeight={canvasHeight}
                      clampPlacement={clampLayerPlacement}
                      isActive={activeLayer?.kind === "text" && activeLayer.id === item.id}
                      onActivate={() => setActiveLayer({ kind: "text", id: item.id })}
                      onDeactivate={() => setActiveLayer(null)}
                      onEdit={() => {
                        setActiveLayer({ kind: "text", id: item.id });
                        openTextEditor(item);
                      }}
                    >
                      <Animated.Text
                        style={[
                          toTextLayerStyle(layer, containerUnits),
                          editingTextId === item.id ? previewTextStyle : null,
                        ]}
                      >
                        {layer.body || TEXT_PLACEHOLDER}
                      </Animated.Text>
                    </DraggableLayer>
                  );
                })}

                {stickers.map((item, index) => {
                  const layer = layout.stickers[index];
                  if (!layer) return null;

                  return (
                    <DraggableLayer
                      key={item.id}
                      ref={(r) => {
                        stickerRefsMap.current.set(item.id, r);
                      }}
                      containerWidth={canvasWidth}
                      containerHeight={canvasHeight}
                      clampPlacement={clampLayerPlacement}
                      isActive={activeLayer?.kind === "sticker" && activeLayer.id === item.id}
                      onActivate={() => setActiveLayer({ kind: "sticker", id: item.id })}
                      onDeactivate={() => setActiveLayer(null)}
                      onEdit={() => {
                        setActiveLayer({ kind: "sticker", id: item.id });
                        setStickerEditor(item.id);
                      }}
                    >
                      <Image
                        source={{ uri: resolveStickerImageUrl(layer) }}
                        style={{ width: layer.sizePx, height: layer.sizePx }}
                        contentFit="contain"
                      />
                    </DraggableLayer>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* Bottom Sheet — always visible toolbar */}
        <BottomSheet
          index={0}
          enableDynamicSizing
          enableContentPanningGesture={false}
          enablePanDownToClose={false}
          backgroundStyle={{ backgroundColor: sheetBg }}
          handleIndicatorStyle={{ backgroundColor: handleColor }}
        >
          <BottomSheetView
            onLayout={(e) => setSheetContentHeight(e.nativeEvent.layout.height + 24 /* handle height */)}
            style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 8, gap: 12 }}
          >
            {/* Background color */}
            <View className="flex-row items-center gap-2">
              <CatalystText variant="caption" tone="subtle" className="w-16">
                背景色
              </CatalystText>
              {/* ponytail: このプリセットは fleet-renderer 由来で、Web 版 (CreateFleetForm) の
                  8 色とは別セットになっている。どちらに寄せるかはパッケージ側で決めたい */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 pr-2"
                className="flex-1"
              >
                {FLEET_DEFAULT_BACKGROUND_COLORS.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    isSelected={backgroundColor === color}
                    onPress={() => setBackgroundColor(color)}
                  />
                ))}
              </ScrollView>
              {/* 任意色は常に押せるようスクロール領域の外に置く */}
              <FleetColorPickerButton
                color={backgroundColor}
                accessibilityLabel="背景色をカラーピッカーで選ぶ"
                size={28}
                onPress={() => setColorTarget("background")}
              />
            </View>

            {/* 選択中レイヤーの操作 — 指では出しにくい「ぴったり水平」「等倍」に戻す手段。
                背景画像には編集ポップアップが無いので、ここに置いて 3 種類とも同じ導線にする */}
            {image && (
              <View className="flex-row items-center gap-2">
                <CatalystText variant="caption" tone="subtle" className="w-16">
                  選択中
                </CatalystText>
                <CatalystText variant="label" className="shrink" numberOfLines={1}>
                  {activeLayerLabel}
                </CatalystText>
                <View className="flex-1 flex-row justify-end gap-2">
                  <Pressable
                    accessibilityLabel="角度をリセット"
                    onPress={() => activeHandle()?.resetRotation()}
                    className="flex-row items-center gap-1.5 rounded-full bg-light-surface-muted px-3 py-2 active:opacity-80 dark:bg-dark-surface-muted"
                  >
                    <UniRotateCcw size={14} className="text-light-text dark:text-dark-text" />
                    <CatalystText variant="label">角度</CatalystText>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="大きさをリセット"
                    onPress={() => activeHandle()?.resetScale()}
                    className="flex-row items-center gap-1.5 rounded-full bg-light-surface-muted px-3 py-2 active:opacity-80 dark:bg-dark-surface-muted"
                  >
                    <UniRotateCcw size={14} className="text-light-text dark:text-dark-text" />
                    <CatalystText variant="label">大きさ</CatalystText>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row gap-3">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                <Pressable
                  onPress={handlePickImage}
                  className="flex-row items-center gap-1.5 rounded-full bg-light-surface-muted px-3 py-2 active:opacity-80 dark:bg-dark-surface-muted"
                >
                  <UniImageIcon size={16} className="text-light-text dark:text-dark-text" />
                  <CatalystText variant="label">{image ? "画像を変更" : "画像を選択"}</CatalystText>
                </Pressable>

                <Pressable
                  onPress={() => setIsNsfw((prev) => !prev)}
                  className={cn(
                    "flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-80",
                    isNsfw
                      ? "bg-light-error-background dark:bg-dark-error-background"
                      : "bg-light-surface-muted dark:bg-dark-surface-muted",
                  )}
                >
                  <UniTriangleAlert
                    size={16}
                    className={cn(
                      "text-light-text dark:text-dark-text",
                      isNsfw && "text-light-error dark:text-dark-error",
                    )}
                  />
                  <CatalystText
                    variant="label"
                    className={isNsfw ? "text-light-error dark:text-dark-error" : undefined}
                  >
                    NSFW
                  </CatalystText>
                </Pressable>

                <Pressable
                  disabled={texts.length >= FLEET_MAX_TEXTS}
                  onPress={openAddText}
                  className={cn(
                    "flex-row items-center gap-1.5 rounded-full bg-light-surface-muted px-3 py-2 active:opacity-80 dark:bg-dark-surface-muted",
                    texts.length >= FLEET_MAX_TEXTS && "opacity-40",
                  )}
                >
                  <UniType size={16} className="text-light-text dark:text-dark-text" />
                  <UniPlus size={14} className="text-light-text dark:text-dark-text" />
                  <CatalystText variant="label">
                    テキスト追加 ({texts.length}/{FLEET_MAX_TEXTS})
                  </CatalystText>
                </Pressable>

                <Pressable
                  disabled={stickers.length >= FLEET_MAX_STICKERS}
                  onPress={() => setStickerEditor(STICKER_EDITOR_ADD)}
                  className={cn(
                    "flex-row items-center gap-1.5 rounded-full bg-light-surface-muted px-3 py-2 active:opacity-80 dark:bg-dark-surface-muted",
                    stickers.length >= FLEET_MAX_STICKERS && "opacity-40",
                  )}
                >
                  <UniPlus size={14} className="text-light-text dark:text-dark-text" />
                  <CatalystText variant="label">
                    ステッカー追加 ({stickers.length}/{FLEET_MAX_STICKERS})
                  </CatalystText>
                </Pressable>
              </ScrollView>
            </View>

            {/* Text chip list */}
            {texts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {texts.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-1 rounded-full border border-light-border bg-light-surface px-3 py-2 dark:border-dark-border dark:bg-dark-surface"
                  >
                    <Text
                      className="max-w-28 text-sm text-light-text dark:text-dark-text text-ellipsis"
                      numberOfLines={1}
                    >
                      {item.body || TEXT_PLACEHOLDER}
                    </Text>
                    <Pressable onPress={() => openTextEditor(item)} className="p-1" hitSlop={8}>
                      <UniPencil size={12} className="text-light-text-muted dark:text-dark-text-muted" />
                    </Pressable>
                    <Pressable onPress={() => handleDeleteText(item.id)} className="p-1" hitSlop={8}>
                      <UniTrash2 size={12} className="text-light-error dark:text-dark-error" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            {stickers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {stickers.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-1 rounded-full border border-light-border bg-light-surface px-3 py-2 dark:border-dark-border dark:bg-dark-surface"
                  >
                    <Image
                      accessibilityLabel={
                        availableReactions.find((reaction) => reaction.symbol === item.emoji)?.name ?? item.emoji
                      }
                      source={{
                        uri: resolveStickerImageUrl({ emoji: item.emoji, imageUrl: reactionUrlMap[item.emoji] }),
                      }}
                      style={{ width: 20, height: 20 }}
                      contentFit="contain"
                    />
                    <Pressable onPress={() => setStickerEditor(item.id)} className="p-1" hitSlop={8}>
                      <UniPencil size={12} className="text-light-text-muted dark:text-dark-text-muted" />
                    </Pressable>
                    <Pressable onPress={() => handleDeleteSticker(item.id)} className="p-1" hitSlop={8}>
                      <UniTrash2 size={12} className="text-light-error dark:text-dark-error" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            {!image && (
              <CatalystText variant="caption" tone="danger">
                ※ 画像は必須です
              </CatalystText>
            )}
          </BottomSheetView>
        </BottomSheet>

        {/* Text editor */}
        <EditorSheet visible={editingText !== null} maxHeight={editorMaxHeight} onClose={closeTextEditor}>
          <ScrollView contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
            <View className="flex-row items-center justify-between">
              <CatalystText variant="subtitle">テキスト</CatalystText>
              <Pressable onPress={closeTextEditor} hitSlop={8}>
                <UniX size={20} className="text-light-text dark:text-dark-text" />
              </Pressable>
            </View>

            <CatalystTextField
              value={editingText?.body ?? ""}
              onChangeText={(v) => editingText && updateText(editingText.id, { body: v })}
              placeholder={TEXT_PLACEHOLDER}
              multiline
              maxLength={FLEET_TEXT_MAX_LENGTH}
              autoFocus={isAddingText}
              className="min-h-16 rounded-lg bg-light-surface p-3 dark:bg-dark-surface"
            />
            <CatalystText variant="caption" tone="muted" className="-mt-2 text-right">
              {(editingText?.body ?? "").length} / {FLEET_TEXT_MAX_LENGTH}
            </CatalystText>

            {/* 文字色・背景色 (色はスウォッチを見れば分かるので hex は出さない) */}
            <View className="flex-row items-center gap-3">
              <CatalystText variant="caption" tone="muted">
                文字色
              </CatalystText>
              <FleetColorPickerButton
                color={editingText?.color ?? DEFAULT_TEXT_COLOR}
                accessibilityLabel="文字色をカラーピッカーで選ぶ"
                onPress={() => setColorTarget("textColor")}
              />
              <CatalystText variant="caption" tone="muted" className="ml-3">
                背景色
              </CatalystText>
              <FleetColorPickerButton
                color={editingText?.backgroundColor ?? TRANSPARENT}
                accessibilityLabel="テキストの背景色をカラーピッカーで選ぶ"
                onPress={() => setColorTarget("textBackground")}
              />
              {editingText?.backgroundColor === TRANSPARENT && (
                <CatalystText variant="caption" tone="subtle">
                  なし
                </CatalystText>
              )}
            </View>

            {/* スタイル — フォントを見せたいのでラベルだけ実フォントにしている以外は
                    CatalystSegmentedControl と同じ見た目・寸法 */}
            <View className="flex-row overflow-hidden rounded-lg bg-light-surface-muted p-0.5 dark:bg-dark-surface-muted">
              {TEXT_STYLE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => editingText && updateText(editingText.id, { textStyle: option.value })}
                  className={cn(
                    "min-h-9 flex-1 items-center justify-center rounded-md px-2 active:opacity-80",
                    editingText?.textStyle === option.value && "bg-light-background dark:bg-dark-background",
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm",
                      editingText?.textStyle === option.value
                        ? "text-light-text dark:text-dark-text"
                        : "text-light-text-muted dark:text-dark-text-muted",
                    )}
                    style={{ fontFamily: FLEET_FONTS[option.value].reactNativeFontFamily }}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row gap-3">
              <CatalystButton
                className="flex-1"
                onPress={() => {
                  if (!editingText) return;
                  handleDeleteText(editingText.id);
                  setEditingTextId(null);
                  setIsAddingText(false);
                }}
                tone="secondary"
              >
                <CatalystButtonText>削除</CatalystButtonText>
              </CatalystButton>
              <CatalystButton className="flex-1" onPress={closeTextEditor} tone="primary">
                <CatalystButtonText>完了</CatalystButtonText>
              </CatalystButton>
            </View>
          </ScrollView>

          {/* iOS では Modal を兄弟で 2 枚提示できないため、テキスト編集中のピッカーは
              このシートの中 (= 同じ Modal の配下) に描く */}
          {colorTarget !== "background" && colorPickerModal}
        </EditorSheet>

        {/* Sticker picker / editor */}
        <EditorSheet
          visible={stickerEditor !== null}
          maxHeight={editorMaxHeight}
          onClose={() => setStickerEditor(null)}
        >
          <View className="gap-3 p-4">
            <View className="flex-row items-center justify-between">
              <CatalystText variant="subtitle">
                {editingSticker === null ? "ステッカーを追加" : "ステッカーを編集"}
              </CatalystText>
              <Pressable onPress={() => setStickerEditor(null)} hitSlop={8}>
                <UniX size={20} className="text-light-text dark:text-dark-text" />
              </Pressable>
            </View>

            <CatalystText variant="caption" tone="muted">
              ステッカーを選択
            </CatalystText>
            <View className="h-56 overflow-hidden rounded-2xl border border-light-border dark:border-dark-border">
              {isLoadingReactions ? (
                <View className="flex-1 items-center justify-center py-6">
                  <ActivityIndicator />
                </View>
              ) : stickerCategories.length > 0 ? (
                <EmojiPickerView categories={stickerCategories} onEmojiSelected={handleSelectSticker} />
              ) : (
                <View className="flex-1 items-center justify-center px-4 py-6">
                  <CatalystText tone="muted" className="text-center">
                    利用できるステッカーがありません
                  </CatalystText>
                </View>
              )}
            </View>

            <View className="flex-row gap-3">
              {editingSticker && (
                <CatalystButton
                  className="flex-1"
                  onPress={() => {
                    handleDeleteSticker(editingSticker.id);
                    setStickerEditor(null);
                  }}
                  tone="secondary"
                >
                  <CatalystButtonText>削除</CatalystButtonText>
                </CatalystButton>
              )}
              <CatalystButton className="flex-1" onPress={() => setStickerEditor(null)} tone="primary">
                <CatalystButtonText>完了</CatalystButtonText>
              </CatalystButton>
            </View>
          </View>
        </EditorSheet>

        {/* 背景色のピッカーは他のポップアップと重ならないのでここに置く */}
        {colorTarget === "background" && colorPickerModal}
      </View>
    </>
  );
}
