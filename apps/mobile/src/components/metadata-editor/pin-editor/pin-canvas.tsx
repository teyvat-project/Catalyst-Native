import { CatalystText } from "@/components/design-system";
import { getCdnUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  getContentRect,
  toDisplayPoint,
  toNormalizedPoint,
  type ContentRect,
  type EditablePin,
} from "@/models/epiclese-pin-editor";
import type { Media } from "@/models/sdk-types";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { withUniwind } from "uniwind";

const UniImage = withUniwind(Image);

const MARKER_SIZE = 28;

type Point = { x: number; y: number };

type Props = {
  media: Media;
  pins: EditablePin[];
  activeIndex: number | null;
  onAdd: (point: Point) => void;
  onSelect: (index: number) => void;
  onMove: (index: number, point: Point) => void;
};

type MarkerProps = {
  index: number;
  pin: EditablePin;
  rect: ContentRect;
  active: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, point: Point) => void;
};

// ドラッグ中は表示だけを動かし、離したときに正規化座標へ変換して確定する
const PinMarker = ({ index, pin, rect, active, onSelect, onMove }: MarkerProps) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const { left, top } = toDisplayPoint(rect, pin);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onChange((event) => setOffset((prev) => ({ x: prev.x + event.changeX, y: prev.y + event.changeY })))
    .onEnd((event) => {
      const point = toNormalizedPoint(rect, { x: left + event.translationX, y: top + event.translationY });
      onMove(index, { x: point.x, y: point.y });
      setOffset({ x: 0, y: 0 });
    });

  return (
    <GestureDetector gesture={pan}>
      <Pressable
        onPress={() => onSelect(index)}
        accessibilityRole="button"
        accessibilityLabel={`${index + 1} 番のピン`}
        hitSlop={8}
        className={cn(
          "absolute items-center justify-center rounded-full border-2 border-white",
          active ? "bg-light-tint dark:bg-dark-tint" : "bg-black/70",
        )}
        style={{
          width: MARKER_SIZE,
          height: MARKER_SIZE,
          left: left - MARKER_SIZE / 2 + offset.x,
          top: top - MARKER_SIZE / 2 + offset.y,
        }}
      >
        <CatalystText variant="caption" className="font-bold text-white">
          {index + 1}
        </CatalystText>
      </Pressable>
    </GestureDetector>
  );
};

// 写真を contain で表示し、その上にピンを重ねる。写真のタップでピンを追加する (レターボックスのタップは無視)
export const PinCanvas = ({ media, pins, activeIndex, onAdd, onSelect, onMove }: Props) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const image = { width: media.metadata?.width ?? 1, height: media.metadata?.height ?? 1 };
  const rect = box ? getContentRect(box, image) : null;

  return (
    <Pressable
      testID="pin-canvas"
      accessibilityLabel="写真をタップしてピンを追加"
      onLayout={(event) => setBox({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      onPress={(event) => {
        if (!rect) return;
        const point = toNormalizedPoint(rect, { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
        if (point.inBounds) onAdd({ x: point.x, y: point.y });
      }}
      className="w-full overflow-hidden bg-light-skeleton dark:bg-dark-skeleton"
      style={{ height: Math.round(windowHeight * 0.45) }}
    >
      <UniImage
        source={{
          uri: getCdnUrl({
            src: media.url,
            variant: "post-details",
            width: windowWidth,
            aspect: { w: image.width, h: image.height },
          }),
        }}
        className="size-full"
        contentFit="contain"
      />
      {rect && (
        <View className="absolute inset-0" pointerEvents="box-none">
          {pins.map((pin, index) => (
            <PinMarker
              key={index}
              index={index}
              pin={pin}
              rect={rect}
              active={activeIndex === index}
              onSelect={onSelect}
              onMove={onMove}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
};
