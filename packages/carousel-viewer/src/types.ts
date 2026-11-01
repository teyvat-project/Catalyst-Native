import type { ReactNode } from "react";
import type { GestureType } from "react-native-gesture-handler";
import type { StyleProp, ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

export type GalleryImage = { id: string; uri: string; width?: number; height?: number; alt?: string };
export type GalleryState = { mode: "carousel" | "detail"; index: number };
export type ViewerGestureState = "idle" | "undecided" | "pinching" | "panning" | "paging" | "dismissing" | "settling";
export type CarouselIndicatorContext = {
  count: number;
  index: number;
  /** Fractional page position that follows the drag on the UI thread. */
  progress: SharedValue<number>;
  setIndex: (index: number) => void;
};
export type CarouselOverlayContext = {
  index: number;
  width: number;
  height: number;
  /**
   * Fractional page position that follows the drag on the UI thread. Unlike the indicator's `progress`,
   * it goes past the first and last page while the track overshoots or rubber-bands, so content drawn
   * over an image can move exactly with it.
   */
  position: SharedValue<number>;
};
export type ImageGalleryProps = {
  images: GalleryImage[];
  initialIndex?: number;
  minScale?: number;
  maxScale?: number;
  pagingScaleThreshold?: number;
  dismissScaleThreshold?: number;
  /** Scale applied by double tap in Detail. Values <= 1 disable double tap. */
  doubleTapScale?: number;
  longPressDuration?: number;
  /** Overrides the system Reduce Motion setting. */
  reduceMotion?: boolean;
  /** When false, tapping the carousel does not open Detail. */
  detailEnabled?: boolean;
  /**
   * Gestures outside the carousel that must not take a horizontal drag that started on it --
   * typically a horizontal pager the carousel sits inside. They are made to wait for the carousel's
   * pan, so a drag it claims never reaches them; a vertical drag it lets go goes to the list.
   * With a single image the carousel does not pan at all, so every drag reaches them.
   */
  competingGestures?: GestureType[];
  onIndexChange?: (index: number) => void;
  onOpenDetail?: (index: number) => void;
  onCloseDetail?: (index: number) => void;
  /** Long press on the Detail image. */
  onLongPress?: (index: number) => void;
  renderImage?: (image: GalleryImage, context: { mode: "carousel" | "detail"; index: number }) => ReactNode;
  style?: StyleProp<ViewStyle>;
  /** UI drawn over the carousel image viewport (not including the indicator). */
  renderCarouselOverlay?: (context: CarouselOverlayContext) => ReactNode;
  /** Replaces the default carousel indicator below the viewport. */
  renderCarouselIndicator?: (context: CarouselIndicatorContext) => ReactNode;
  renderOverlay?: (context: { index: number; close: () => void }) => ReactNode;
  /** Fullscreen UI above the Detail chrome, outside the Safe Area and dismiss fade (e.g. bottom sheets). */
  renderDetailForeground?: (context: { index: number; close: () => void }) => ReactNode;
};
export type PagerProps = ImageGalleryProps & { index: number; onIndexChange: (index: number) => void };
