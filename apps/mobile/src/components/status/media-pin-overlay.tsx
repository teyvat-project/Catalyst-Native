import { CatalystBadge, CatalystBadgeText, CatalystText } from "@/components/design-system";
import { cn } from "@/lib/utils";
import { openUrlWithBrowser } from "@/models/browser-settings";
import { EPICLESE_ITEM_TYPE_LABELS, type EpicleseReference } from "@/models/epiclese";
import { getContentRect, toDisplayPoint } from "@/models/epiclese-pin-editor";
import type { Media } from "@/models/sdk-types";
import { useRouter } from "expo-router";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { ExternalLink, Tags } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useColorScheme } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const UniExternalLink = withUniwind(ExternalLink);

type Props = {
  medias: Media[];
  /** media.id → 写真上のピン */
  pins: Record<string, EpicleseReference[] | undefined>;
  /** 表示中のページ */
  index: number;
  /** スワイプに追従するページ位置（小数）。UI スレッドで更新され、先頭・末尾を越えても丸めない */
  position: SharedValue<number>;
  /** ピンを重ねる表示領域（画像コンテナ）の幅 */
  width: number;
  /** ピンを重ねる表示領域（画像コンテナ）の高さ */
  height: number;
  visible: boolean;
  onToggleVisible: () => void;
};

// 写真上のピン（座標付きメタデータ）のオーバーレイ表示。
// ページを移るときにピンがパッと入れ替わらないよう、表示中のページと前後のページのピンを重ねておき、
// スワイプの位置に合わせて動かす。
export const MediaPinOverlay = ({ medias, pins, index, position, width, height, visible, onToggleVisible }: Props) => {
  const router = useRouter();
  const [selected, setSelected] = useState<EpicleseReference | null>(null);
  const detailSheetRef = useRef<BottomSheetModal>(null);
  const theme = useColorScheme() ?? "light";
  const insets = useSafeAreaInsets();

  // ページごとにピンがあるか
  const hasPins = useMemo(() => medias.map((media) => !!pins[media.id]?.length), [medias, pins]);
  const hasPinsHere = hasPins[index];

  // タグボタンは、スワイプ中の前後 2 ページのピンの有無を位置で補間した濃さにする。
  // ボタンは動かないので、端を越えて引っぱっても薄くならないよう範囲に丸める
  const buttonStyle = useAnimatedStyle(() => {
    const current = Math.min(Math.max(position.value, 0), hasPins.length - 1);
    const from = Math.floor(current);
    const t = current - from;
    return { opacity: (hasPins[from] ? 1 - t : 0) + (hasPins[from + 1] ? t : 0) };
  });

  const openDetail = useCallback((reference: EpicleseReference) => {
    setSelected(reference);
    detailSheetRef.current?.present();
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  if (!hasPins.includes(true)) return null;

  return (
    <>
      <View className="absolute inset-0" pointerEvents="box-none">
        {visible &&
          [index - 1, index, index + 1].map((page) => {
            const references = medias[page] && pins[medias[page].id];
            if (!references?.length) return null;
            return (
              <PinLayer
                key={medias[page].id}
                media={medias[page]}
                references={references}
                page={page}
                active={page === index}
                position={position}
                width={width}
                height={height}
                onPressPin={openDetail}
              />
            );
          })}

        <Animated.View
          className="absolute right-3 bottom-3"
          style={buttonStyle}
          pointerEvents={hasPinsHere ? "auto" : "none"}
          // ピンの無い画像では透明なだけで残っているので、スクリーンリーダーからも隠す
          accessibilityElementsHidden={!hasPinsHere}
          importantForAccessibility={hasPinsHere ? "auto" : "no-hide-descendants"}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? "写真上のタグを非表示" : "写真上のタグを表示"}
            onPress={onToggleVisible}
            className={cn(
              "size-9 items-center justify-center rounded-full active:bg-black/80",
              visible ? "bg-black/60" : "bg-black/40",
            )}
          >
            <Tags size={16} color="white" />
          </Pressable>
        </Animated.View>
      </View>

      {/* ピンのアイテム詳細シート */}
      <BottomSheetModal
        ref={detailSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme === "dark" ? "#1C1C1E" : "#FFFFFF" }}
        handleIndicatorStyle={{ backgroundColor: theme === "dark" ? "#48484A" : "#C7C7CC" }}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + 16 }}>
          {selected ? (
            <View className="gap-3 px-5 pt-2">
              <View className="flex-row">
                <CatalystBadge tone="accent">
                  <CatalystBadgeText>{EPICLESE_ITEM_TYPE_LABELS[selected.type] ?? selected.type}</CatalystBadgeText>
                </CatalystBadge>
              </View>
              <Pressable
                accessibilityRole="link"
                className="active:opacity-75"
                onPress={() => {
                  detailSheetRef.current?.dismiss();
                  router.push(`/items/${selected.reference}`);
                }}
              >
                <CatalystText variant="subtitle" tone="link">
                  {selected.name}
                </CatalystText>
              </Pressable>
              <CatalystText variant="caption" tone="muted">
                作者: {selected.author.name}
              </CatalystText>
              {selected.externalUrl ? (
                <Pressable
                  accessibilityRole="link"
                  className="flex-row items-center gap-1.5 active:opacity-75"
                  onPress={() => selected.externalUrl && openUrlWithBrowser(selected.externalUrl)}
                >
                  <UniExternalLink size={14} className="text-light-link dark:text-dark-link" />
                  <CatalystText variant="caption" tone="link">
                    販売ページを見る
                  </CatalystText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
};

// PinLayer の上下を広げる幅。文字を大きくする設定でラベルの行が高くなっても、端のピンが欠けない程度に取る
const CLIP_MARGIN = 48;

type PinLayerProps = {
  media: Media;
  references: EpicleseReference[];
  page: number;
  /** 表示中のページか。前後のページのピンは画面外にあるので、スクリーンリーダーから隠す */
  active: boolean;
  position: SharedValue<number>;
  width: number;
  height: number;
  onPressPin: (reference: EpicleseReference) => void;
};

// 1 枚分のピン。x, y は元画像に対する 0-10000 の正規化座標（万分率）。画像は contain 表示のため、
// コンテナ内の実描画領域（レターボックス分を除いた矩形）を求めてから配置する。
const PinLayer = ({ media, references, page, active, position, width, height, onPressPin }: PinLayerProps) => {
  const sortedReferences = useMemo(() => [...references].sort((a, b) => a.order - b.order), [references]);

  const contentRect = useMemo(
    () =>
      getContentRect(
        { width, height },
        { width: media.metadata?.width ?? width, height: media.metadata?.height ?? height },
      ),
    [media, width, height],
  );

  // 画像と一緒に流れるよう、自分のページとスワイプ位置の差だけずらす
  const layerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (page - position.value) * width }] }));

  return (
    // はみ出したラベルが隣の画像に重ならないよう、左右は自分の画像の幅で切る。
    // 上下まで切ると端のピンが欠けるので、上下は CLIP_MARGIN だけ広げておく
    <Animated.View
      className="absolute inset-x-0 overflow-hidden"
      // 上下の広げ幅は rowTop と共有するので style で渡す（-inset-y-* は Uniwind で効かず高さが 0 になった）
      style={[{ top: -CLIP_MARGIN, bottom: -CLIP_MARGIN }, layerStyle]}
      pointerEvents="box-none"
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {sortedReferences.map((reference, i) => {
        const { left, top } = toDisplayPoint(contentRect, reference);
        // ドット（16px）の中心が (left, top) に一致するよう、行の起点を半径分ずらす。層を上に広げた分は下げる
        const rowTop = top + CLIP_MARGIN - 12;
        // ラベルは画像中心から見て外側（ピンが右半分なら右、左半分なら左）に表示する
        const labelOnRight = reference.x > 5000;

        return (
          <Pressable
            key={`${reference.reference}:${i}`}
            accessibilityRole="button"
            accessibilityLabel={reference.name}
            hitSlop={8}
            onPress={() => onPressPin(reference)}
            className="absolute flex-row items-center gap-1.5 active:opacity-80"
            // ラベルが左向きのときはコンテナが左方向に伸びるよう right 基準で配置する
            style={labelOnRight ? { left: left - 8, top: rowTop } : { right: width - left - 8, top: rowTop }}
          >
            {labelOnRight ? null : <PinLabel name={reference.name} />}
            <View className="size-4 rounded-full border-2 border-white bg-light-accent dark:bg-dark-accent" />
            {labelOnRight ? <PinLabel name={reference.name} /> : null}
          </Pressable>
        );
      })}
    </Animated.View>
  );
};

const PinLabel = ({ name }: { name: string }) => {
  return (
    <View className="max-w-40 rounded-md bg-black/70 px-2 py-1">
      <Text className="text-xs font-medium text-white" numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
};
