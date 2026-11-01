import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { transformSync } from "@babel/core";
import React, { useState } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

class ManualGesture {
  callbacks = {};
}
function builder(manual = false) {
  const result = manual ? new ManualGesture() : { callbacks: {} };
  for (const name of [
    "shouldCancelWhenOutside",
    "maxPointers",
    "activeOffsetX",
    "failOffsetY",
    "manualActivation",
    "maxDistance",
    "blocksExternalGesture",
    "onStart",
    "onUpdate",
    "onEnd",
    "onFinalize",
    "onTouchesDown",
    "onTouchesMove",
    "onTouchesUp",
    "onTouchesCancelled",
  ]) {
    result[name] = (...args) => {
      result.callbacks[name] = args.length > 1 ? args : args[0];
      return result;
    };
  }
  return result;
}
function assertSerializable(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  assert.ok(!(value instanceof ManualGesture), "worklet captured ManualGesture");
  seen.add(value);
  for (const child of Object.values(value)) assertSerializable(child, seen);
}
// react-native-worklets 0.13+ captures __closure as an array that the worklet destructures by
// position (`const [a, b] = this.__closure`), so resolve a captured variable by its name.
function closureValue(worklet, name) {
  const names = worklet.__initData.code.match(/const\s*\[([^\]]*)\]\s*=\s*this\.__closure/)[1].split(",");
  return worklet.__closure[names.map((n) => n.trim()).indexOf(name)];
}
const mock = {
  View: "View",
  Text: "Text",
  Image: "Image",
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  Modal: "Modal",
  GestureDetector: "GestureDetector",
  GestureHandlerRootView: "GestureHandlerRootView",
  SafeAreaProvider: "SafeAreaProvider",
  SafeAreaView: "SafeAreaView",
  AccessibilityInfo: { setAccessibilityFocus() {} },
  findNodeHandle: () => null,
  StyleSheet: {
    create: (styles) => styles,
    absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  },
  Gesture: {
    Manual: () => builder(true),
    Pan: () => builder(),
    Tap: () => builder(),
    Exclusive: (...gestures) => gestures,
  },
  useSafeAreaInsets: () => ({ bottom: 0 }),
  useSharedValue: (value) => useState(() => ({ value }))[0],
  useDerivedValue: (fn) => ({
    get value() {
      return fn();
    },
  }),
  useReducedMotion: () => false,
  useAnimatedStyle: (fn) => {
    assert.ok(fn.__closure, "test must exercise Babel-transformed worklets");
    assertSerializable(fn.__closure);
    return Object.defineProperties(
      {},
      Object.fromEntries(Object.keys(fn()).map((key) => [key, { enumerable: true, get: () => fn()[key] }])),
    );
  },
  cancelAnimation() {},
  withSpring: (target) => target,
  withTiming: (target) => target,
  ReduceMotion: { System: "system" },
  scheduleOnRN: (fn, ...args) => fn(...args),
};
globalThis.__viewerTest = mock;
registerHooks({
  resolve(specifier, context, next) {
    if (
      [
        "react-native",
        "react-native-gesture-handler",
        "react-native-reanimated",
        "react-native-worklets",
        "react-native-safe-area-context",
      ].includes(specifier)
    )
      return { url: "viewer-mock:" + specifier, shortCircuit: true };
    if (specifier.startsWith("./") && context.parentURL?.includes("/carousel-viewer/src/")) {
      for (const extension of [".ts", ".tsx"]) {
        if (existsSync(new URL(specifier + extension, context.parentURL))) return next(specifier + extension, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("viewer-mock:"))
      return {
        format: "module",
        shortCircuit: true,
        source: `export const { ${Object.keys(mock).join(", ")} } = globalThis.__viewerTest;
        export default { View: 'AnimatedView' };`,
      };
    if (url.includes("/carousel-viewer/src/") && /\.tsx?$/.test(url))
      return {
        format: "module",
        shortCircuit: true,
        source: transformSync(readFileSync(new URL(url), "utf8"), {
          filename: new URL(url).pathname,
          configFile: false,
          babelrc: false,
          presets: ["@babel/preset-typescript"],
          plugins: [["@babel/plugin-transform-react-jsx", { runtime: "automatic" }], "react-native-worklets/plugin"],
        }).code,
      };
    return next(url, context);
  },
});

const math = await import("../src/math.ts");
const { ImageCarousel } = await import("../src/ImageCarousel.tsx");
// Drives one drag from a fixed origin to (dx, dy), reported in steps so only the first move past
// the threshold gets to decide, then continuing well past it. Returns what the gesture asked for.
function drag(pan, dx, dy) {
  const decisions = [];
  const manager = { activate: () => decisions.push("activate"), fail: () => decisions.push("fail") };
  const at = (x, y) => ({ allTouches: [{ id: 0, x: 100 + x, y: 100 + y }] });
  pan.callbacks.onTouchesDown(at(0, 0), manager);
  for (const step of [0.25, 1, 4]) pan.callbacks.onTouchesMove(at(dx * step, dy * step), manager);
  // Finalizing clears the decision so the next drag starts from scratch.
  pan.callbacks.onFinalize({}, decisions[0] === "activate");
  return decisions;
}
const { ImageDetailViewer } = await import("../src/ImageDetailViewer.tsx");
const images = Array.from({ length: 4 }, (_, i) => ({
  id: String(i),
  uri: `https://example.com/${i}.jpg`,
  width: 400,
  height: 400,
}));
const props = { images, index: 0, onIndexChange() {}, onOpenDetail() {}, onClose() {} };
const imageNode = (renderer, index) =>
  renderer.root.findAllByType("Image").find((node) => node.props.source.uri === images[index].uri);

for (const Component of [ImageCarousel, ImageDetailViewer]) {
  test(`${Component.name} keeps adjacent images mounted across forward/backward paging`, async () => {
    let renderer;
    await act(() => {
      renderer = create(React.createElement(Component, props));
    });
    await act(() =>
      renderer.root
        .find((node) => typeof node.props.onLayout === "function")
        .props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } }),
    );
    const first = imageNode(renderer, 0),
      second = imageNode(renderer, 1);
    await act(() => {
      first.props.onLoad();
      second.props.onLoad();
    });
    await act(() => renderer.update(React.createElement(Component, { ...props, index: 1 })));
    assert.equal(imageNode(renderer, 0), first);
    assert.equal(imageNode(renderer, 1), second);
    // Only the newly mounted next image is loading.
    assert.equal(renderer.root.findAllByType("ActivityIndicator").length, 1);
    await act(() => renderer.update(React.createElement(Component, props)));
    assert.equal(imageNode(renderer, 0), first);
    assert.equal(imageNode(renderer, 1), second);
    assert.equal(renderer.root.findAllByType("ActivityIndicator").length, 0);
    await act(() => renderer.unmount());
  });
}

test("carousel indicator is a sibling below the sized image viewport", async () => {
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ImageCarousel, props));
  });
  const viewport = renderer.root.find((node) => typeof node.props.onLayout === "function");
  const indicator = renderer.root.find((node) => node.props.accessibilityElementsHidden === true);
  assert.ok(!viewport.findAll((node) => node === indicator).length);
  assert.equal(indicator.props.style[1].position, "relative");
  await act(() => renderer.unmount());
});

test("detail pinch uses serializable worklets and page changes reset zoom without remounting", async () => {
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ImageDetailViewer, props));
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } }),
  );
  const callbacks = renderer.root.findByType("GestureDetector").props.gesture.callbacks;
  for (const callback of Object.values(callbacks)) {
    if (typeof callback === "function") assertSerializable(callback.__closure);
  }
  const event = (x) => ({
    numberOfTouches: 2,
    allTouches: [
      { id: 1, x: 100, y: 400 },
      { id: 2, x, y: 400 },
    ],
  });
  callbacks.onTouchesDown(event(200), { activate() {} });
  callbacks.onTouchesMove(event(300));
  assert.equal(closureValue(callbacks.onTouchesDown, "scale").value, 2);
  const second = imageNode(renderer, 1);
  await act(() => renderer.update(React.createElement(ImageDetailViewer, { ...props, index: 1 })));
  assert.equal(imageNode(renderer, 1), second);
  const next = renderer.root.findByType("GestureDetector").props.gesture.callbacks;
  assert.equal(closureValue(next.onTouchesDown, "scale").value, 1);
  assert.equal(closureValue(next.onTouchesMove, "pager").value, -400);
  await act(() => renderer.unmount());
});

test("carousel keeps intermediate pages mounted while springing to a distant index", async () => {
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ImageCarousel, props));
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
  await act(() => renderer.update(React.createElement(ImageCarousel, { ...props, index: 3 })));
  for (const index of [0, 1, 2, 3]) assert.ok(imageNode(renderer, index), `page ${index} is mounted`);
  await act(() => renderer.unmount());
});

test("carousel pages on a short drag and accepts the next swipe before re-render", async () => {
  const changes = [];
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ImageCarousel, { ...props, onIndexChange: (i) => changes.push(i) }));
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
  const [pan] = renderer.root.findByType("GestureDetector").props.gesture;
  const swipe = (translationX) => {
    pan.callbacks.onStart();
    pan.callbacks.onUpdate({ translationX });
    pan.callbacks.onEnd({ translationX, velocityX: 0 });
  };
  swipe(-50);
  swipe(-50);
  assert.deepEqual(changes, [1, 2]);
  // A drag under 10% of the width returns to the current page.
  swipe(-30);
  assert.deepEqual(changes, [1, 2]);
  await act(() => renderer.unmount());
});

test("carousel commits to one axis and hands steeper drags to the scroll view", async () => {
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ImageCarousel, props));
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
  const [pan] = renderer.root.findByType("GestureDetector").props.gesture;
  const decide = (dx, dy) => drag(pan, dx, dy);
  assert.deepEqual(decide(60, 0), ["activate"]);
  assert.deepEqual(decide(-60, 0), ["activate"]);
  assert.deepEqual(decide(0, 60), ["fail"]);
  // The dominant axis wins: ~34 degrees is a swipe, ~56 degrees scrolls the timeline (the old
  // activeOffsetX/failOffsetY boxes made it a swipe), and exactly 45 degrees goes to the list.
  assert.deepEqual(decide(60, 40), ["activate"]);
  assert.deepEqual(decide(40, 60), ["fail"]);
  assert.deepEqual(decide(60, 60), ["fail"]);
  assert.deepEqual(decide(-60, -60), ["fail"]);
  // Decided once and only once: a drag that starts horizontal stays the carousel's even when it
  // turns vertical later (the third step above is 4x steeper).
  assert.deepEqual(decide(60, 10), ["activate"]);
  await act(() => renderer.unmount());
});

test("worklets run from their serialized form with only __closure in scope", () => {
  // The UI runtime rebuilds each worklet from __initData.code and supplies __closure as `this`;
  // module scope is gone there. The plugin unpacks the closure at the top of the body, so anything
  // evaluated earlier -- a parameter default referencing a captured constant, say -- throws on the
  // UI thread while still working when the test calls the worklet as an ordinary function.
  const run = (worklet, ...args) => {
    assert.ok(worklet.__initData?.code, "expected a Babel-transformed worklet");
    return new Function(`return (${worklet.__initData.code})`)().apply({ __closure: worklet.__closure }, args);
  };
  assert.equal(run(math.decidePanAxis, 0, 0), "undecided");
  assert.equal(run(math.decidePanAxis, 60, 0), "horizontal");
  assert.equal(run(math.decidePanAxis, 60, 60), "vertical");
  assert.equal(run(math.clamp, 5, 0, 3), 3);
  assert.equal(run(math.rubberBand, 40, -100, 100, 400), 40);
  assert.deepEqual(run(math.getContainSize, 400, 800, 1600, 800), { width: 400, height: 200 });
  assert.deepEqual(run(math.getPanBounds, 400, 800, 400, 400, 1), { x: 0, y: 0 });
  assert.equal(run(math.getPagingTarget, 1, 3, -81, 0, 400), 2);
  assert.equal(run(math.shouldDismiss, 200, 0, 800), true);
  assert.equal(run(math.getZoomTranslationForFocalPoint, 100, 100, 0, 1, 2), -100);
  assert.equal(run(math.lockDirection, 20, 0), "paging");
});

test("competing gestures are blocked and a vertical drag still fails to the list", async () => {
  const pager = { name: "pagerScroll" },
    drawer = { name: "drawerSwipe" };
  let renderer;
  await act(() => {
    renderer = create(React.createElement(ImageCarousel, { ...props, competingGestures: [pager, drawer] }));
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
  const [pan] = renderer.root.findByType("GestureDetector").props.gesture;
  assert.deepEqual(pan.callbacks.blocksExternalGesture, [pager, drawer]);
  // Every drag whose horizontal component dominates is the carousel's, so none is left for the pager.
  assert.deepEqual(drag(pan, 60, 0), ["activate"]);
  assert.deepEqual(drag(pan, 60, 40), ["activate"]);
  // Vertical drags must fail, not hold the touch in BEGAN: on iOS holding it froze the timeline
  // under the carousel.
  assert.deepEqual(drag(pan, 60, 60), ["fail"]);
  assert.deepEqual(drag(pan, 0, 60), ["fail"]);
  await act(() => renderer.unmount());
});

test("a single image leaves every drag to the pager and the list", async () => {
  const pager = { name: "pagerScroll" };
  const opened = [];
  let renderer;
  await act(() => {
    renderer = create(
      React.createElement(ImageCarousel, {
        ...props,
        images: images.slice(0, 1),
        competingGestures: [pager],
        onOpenDetail: (i) => opened.push(i),
      }),
    );
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
  // Only the tap to open the detail view remains: there is no pan to claim a horizontal drag or block
  // the pager, so a horizontal swipe on the image switches tabs instead of rubber-banding (#60).
  const gesture = renderer.root.findByType("GestureDetector").props.gesture;
  assert.ok(!Array.isArray(gesture));
  assert.equal(typeof gesture.callbacks.maxDistance, "number");
  gesture.callbacks.onEnd({}, true);
  assert.deepEqual(opened, [0]);
  // Nothing to page to, so screen readers must not offer next/previous either.
  const viewport = renderer.root.find((node) => node.props.accessibilityActions);
  assert.equal(viewport.props.accessibilityRole, "image");
  assert.deepEqual(
    viewport.props.accessibilityActions.map((a) => a.name),
    ["activate"],
  );
  await act(() => renderer.unmount());
});

test("overlay position follows the track past the first page while the indicator progress stays clamped", async () => {
  let overlay;
  let indicator;
  let renderer;
  await act(() => {
    renderer = create(
      React.createElement(ImageCarousel, {
        ...props,
        renderCarouselOverlay: (context) => {
          overlay = context;
          return null;
        },
        renderCarouselIndicator: (context) => {
          indicator = context;
          return null;
        },
      }),
    );
  });
  await act(() =>
    renderer.root
      .find((node) => typeof node.props.onLayout === "function")
      .props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
  const [pan] = renderer.root.findByType("GestureDetector").props.gesture;
  pan.callbacks.onStart();
  pan.callbacks.onUpdate({ translationX: -200 });
  assert.equal(overlay.position.value, 0.5);
  assert.equal(indicator.progress.value, 0.5);
  // Dragging right on the first page rubber-bands the track past it.
  pan.callbacks.onUpdate({ translationX: 200 });
  assert.ok(overlay.position.value < 0);
  assert.equal(indicator.progress.value, 0);
  await act(() => renderer.unmount());
});
