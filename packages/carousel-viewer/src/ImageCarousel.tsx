import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useMotion } from "./animation";
import { ImageContent } from "./ImageContent";
import { clamp, decidePanAxis, DIRECTION_THRESHOLD, getPagingTarget, rubberBand } from "./math";
import { PageIndicator } from "./PageIndicator";
import { styles } from "./styles";
import type { PagerProps } from "./types";

// Fraction of the width a slow drag needs to change pages; flicks page by velocity.
const CAROUSEL_PAGING_DISTANCE = 0.1;

type Props = PagerProps & { onOpenDetail: (index: number) => void };

function CarouselPages({
  width,
  height,
  offset,
  ...props
}: Props & { width: number; height: number; offset: SharedValue<number> }) {
  const { images, index, onIndexChange, onOpenDetail, renderImage, detailEnabled = true } = props;
  const competing = props.competingGestures ?? [];
  const { reduced, spring } = useMotion(props.reduceMotion);
  // Page the track is at or springing to. Gestures read this instead of `index`, which lags behind until re-render.
  const page = useSharedValue(index);
  const settling = useSharedValue(false);
  const dragStart = useSharedValue(0);
  // Where the first finger of this drag went down, and whether the drag has committed to an axis.
  const tracking = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const decided = useSharedValue(false);
  const count = images.length;
  const previous = useRef({ index, width });
  // Page the animation starts from, so pages in between stay mounted while jumping several pages.
  const [jumpFrom, setJumpFrom] = useState<number | null>(null);
  useEffect(() => () => cancelAnimation(offset), [offset]);
  useLayoutEffect(() => {
    const target = -index * width;
    const from = previous.current;
    previous.current = { index, width };
    // A swipe already moved `page` here and is springing with its fling velocity; leave it running.
    if (from.width === width && from.index !== index && page.value === index) return;
    // External index changes (e.g. indicator taps) spring there; resizes snap.
    const animate = !reduced && from.width === width && from.index !== index && offset.value !== target;
    cancelAnimation(offset);
    page.value = index;
    if (!animate) {
      offset.value = target;
      settling.value = false;
      setJumpFrom(null);
      return;
    }
    setJumpFrom(Math.abs(from.index - index) > 1 ? from.index : null);
    settling.value = true;
    offset.value = withSpring(target, spring, (finished) => {
      if (finished) {
        settling.value = false;
        scheduleOnRN(setJumpFrom, null);
      }
    });
    // `spring` is rebuilt every render; it only depends on the reduce-motion values listed here.
  }, [index, width, offset, page, settling, reduced, props.reduceMotion]);
  const firstPage = Math.max(0, Math.min(index, jumpFrom ?? index) - 1);
  const lastPage = Math.max(index, jumpFrom ?? index) + 1;

  const pan = Gesture.Pan()
    .maxPointers(1)
    // activeOffsetX/failOffsetY are independent per-axis boxes: with 8/12 a drag up to ~56 degrees
    // off horizontal still crossed the x box first and stole the touch, so the timeline felt stuck
    // under any diagonal. Commit to the dominant axis instead, the way a UIPanGestureRecognizer
    // that fails itself in touchesMoved does.
    .manualActivation(true)
    .onTouchesDown((e) => {
      // Only the first finger of the drag sets the origin; later ones must not move the baseline.
      if (tracking.value || e.allTouches.length === 0) return;
      tracking.value = true;
      touchStartX.value = e.allTouches[0].x;
      touchStartY.value = e.allTouches[0].y;
    })
    .onTouchesMove((e, manager) => {
      if (decided.value || !tracking.value || e.allTouches.length === 0) return;
      const axis = decidePanAxis(e.allTouches[0].x - touchStartX.value, e.allTouches[0].y - touchStartY.value);
      if (axis === "undecided") return;
      decided.value = true;
      // Failing releases the touch to the enclosing scroll view for the rest of the drag. Never hold
      // a vertical drag in BEGAN instead: on iOS the timeline was observed not to scroll at all
      // while this pan was held.
      if (axis === "horizontal") manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      // Grab the track where it is, even mid-spring, so consecutive swipes are never dropped.
      cancelAnimation(offset);
      settling.value = false;
      dragStart.value = offset.value;
    })
    .onUpdate((e) => {
      // Only the neighbours of `page` are mounted, so resist beyond them (and beyond the ends).
      offset.value = rubberBand(
        dragStart.value + e.translationX,
        -Math.min(page.value + 1, count - 1) * width,
        -Math.max(page.value - 1, 0) * width,
        width,
      );
    })
    .onEnd((e) => {
      const from = page.value;
      const target = getPagingTarget(
        from,
        count,
        offset.value + from * width,
        e.velocityX,
        width,
        CAROUSEL_PAGING_DISTANCE,
      );
      page.value = target;
      settling.value = true;
      offset.value = withSpring(-target * width, { ...spring, velocity: e.velocityX }, (finished) => {
        if (finished) settling.value = false;
      });
      // Report immediately so the next swipe and the indicator do not wait for the spring to rest.
      if (target !== from) scheduleOnRN(onIndexChange, target);
    })
    .onFinalize((_e, success) => {
      // Clear the axis decision however the drag ended, so the next one starts from scratch.
      tracking.value = false;
      decided.value = false;
      if (!success && !settling.value && offset.value !== -page.value * width)
        offset.value = withSpring(-page.value * width, spring);
    });
  // A single image has nowhere to page to, so leave horizontal drags to the competing gestures
  // (e.g. the tab pager) instead of claiming them only to rubber-band in place.
  const pageable = count > 1;
  if (pageable && competing.length > 0) pan.blocksExternalGesture(...competing);

  // Tap has no distance limit of its own, and Exclusive lets it through whenever the pan fails,
  // so without this a drag the pan handed to the scroll view would also open the detail view.
  const tap = Gesture.Tap()
    .maxDistance(DIRECTION_THRESHOLD)
    .onEnd((_e, success) => {
      if (success && detailEnabled && !settling.value) scheduleOnRN(onOpenDetail, page.value);
    });

  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <GestureDetector gesture={pageable ? Gesture.Exclusive(pan, tap) : tap}>
      <Animated.View
        style={styles.viewport}
        accessible
        accessibilityRole={pageable ? "adjustable" : "image"}
        accessibilityLabel={`${images[index].alt ?? "画像"}、画像 ${index + 1} / ${images.length}`}
        accessibilityActions={[
          ...(detailEnabled ? [{ name: "activate", label: "画像を開く" }] : []),
          ...(pageable
            ? [
                { name: "increment", label: "次の画像" },
                { name: "decrement", label: "前の画像" },
              ]
            : []),
        ]}
        onAccessibilityAction={(e) => {
          const action = e.nativeEvent.actionName;
          if (action === "activate") {
            if (detailEnabled) onOpenDetail(index);
          } else if (action === "increment" || action === "decrement")
            onIndexChange(clamp(index + (action === "increment" ? 1 : -1), 0, images.length - 1));
        }}
      >
        <Animated.View style={[styles.absolute, animated]}>
          {images.slice(firstPage, lastPage + 1).map((image, i) => {
            const page = firstPage + i;
            return (
              <View key={image.id} style={[styles.page, { width, height, left: page * width }]}>
                <ImageContent image={image} index={page} mode="carousel" renderImage={renderImage} />
              </View>
            );
          })}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export function ImageCarousel(props: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const offset = useSharedValue(0);
  const { index, images } = props;
  const { width } = size;
  const count = images.length;
  // Unclamped, so overlay content stays on the image while it overshoots or rubber-bands past either end.
  const position = useDerivedValue(() => (width > 0 ? -offset.value / width : index));
  const progress = useDerivedValue(() => clamp(position.value, 0, count - 1));

  return (
    <View>
      <View style={[styles.gallery, props.style]} onLayout={(e) => setSize(e.nativeEvent.layout)}>
        {size.width > 0 && size.height > 0 && props.images.length > 0 && (
          <>
            <CarouselPages {...props} {...size} offset={offset} />
            {/* Sibling of the gesture view so overlay touches never reach carousel gestures. */}
            {props.renderCarouselOverlay && (
              <View style={styles.absolute} pointerEvents="box-none">
                {props.renderCarouselOverlay({ index, width: size.width, height: size.height, position })}
              </View>
            )}
          </>
        )}
      </View>
      {props.renderCarouselIndicator ? (
        props.renderCarouselIndicator({ count, index, progress, setIndex: props.onIndexChange })
      ) : (
        <PageIndicator count={count} index={index} placement="below" progress={progress} />
      )}
    </View>
  );
}
