import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import type { ReaderDisplayItem } from "../../domain/layout/readerItems";
import { stripWindowForOffset } from "../../domain/layout/stripWindow";
import {
  clampStripCameraTranslation,
  stripCameraScreenPointToWorld,
  stripCameraTranslationForScale,
  stripPageIndexForWorldY,
  type StripCameraMetrics,
} from "./stripCamera";

export interface StripReaderHandle {
  scrollToOffset: (options: { offset: number; animated?: boolean }) => void;
  scrollToIndex: (options: {
    index: number;
    animated?: boolean;
    viewPosition?: number;
  }) => void;
  stepByViewport: (direction: "previous" | "next") => void;
}

export interface StripTapEvent {
  /** Tap coordinates inside the strip viewport, not inside a page row. */
  x: number;
  y: number;
  /** Display item under the tapped world point. */
  index: number;
}

export interface StripReaderProps {
  items: ReaderDisplayItem[];
  offsets: readonly number[];
  viewport: { width: number; height: number };
  resetKey: string;
  initialOffset?: number;
  onScroll: (offset: number) => void;
  onScrollBeginDrag: () => void;
  onTap: (event: StripTapEvent) => void;
  onLongPress: (index: number) => void;
  renderPage: (item: ReaderDisplayItem, index: number) => ReactNode;
}

const MAX_CAMERA_SCALE = 4;
const MIN_CAMERA_SCALE = 1;
const ZOOM_RESET_THRESHOLD = 1.05;
const TAP_TRAVEL_LIMIT = 12;
const TAP_STEP_RATIO = 0.75;

function metricsFor(
  scale: number,
  scrollY: number,
  viewport: { width: number; height: number },
  contentHeight: number,
): StripCameraMetrics {
  "worklet";
  return {
    scale,
    scrollY,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    contentHeight,
  };
}

const StripReader = forwardRef<StripReaderHandle, StripReaderProps>(
  function StripReader(
    {
      items,
      offsets,
      viewport,
      resetKey,
      initialOffset = 0,
      onScroll,
      onScrollBeginDrag,
      onTap,
      onLongPress,
      renderPage,
    },
    ref,
  ) {
    const scrollRef = useRef<ScrollView>(null);
    const lastResetKeyRef = useRef(resetKey);
    const lastMountedPageRef = useRef(0);
    const [zoomed, setZoomed] = useState(false);
    const [windowRange, setWindowRange] = useState(() =>
      stripWindowForOffset(
        offsets,
        items.length,
        Math.max(0, initialOffset),
        viewport.height,
      ),
    );

    const scale = useSharedValue(1);
    const pinchStartScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const panStartX = useSharedValue(0);
    const panStartY = useSharedValue(0);
    const scrollY = useSharedValue(Math.max(0, initialOffset));
    const viewportWidth = useSharedValue(viewport.width);
    const viewportHeight = useSharedValue(viewport.height);
    const contentHeightValue = useSharedValue(
      Math.max(offsets[offsets.length - 1] ?? 0, viewport.height),
    );

    const contentHeight = Math.max(
      offsets[offsets.length - 1] ?? 0,
      viewport.height,
    );

    const workletMetrics = (
      currentScale: number,
      currentScrollY: number,
    ): StripCameraMetrics => {
      "worklet";
      return metricsFor(
        currentScale,
        currentScrollY,
        { width: viewportWidth.value, height: viewportHeight.value },
        contentHeightValue.value,
      );
    };

    const updateWindow = useCallback(
      (offset: number) => {
        const next = stripWindowForOffset(
          offsets,
          items.length,
          offset,
          viewport.height,
        );
        setWindowRange((current) =>
          current.start === next.start && current.end === next.end
            ? current
            : next,
        );
      },
      [items.length, offsets, viewport.height],
    );

    const syncPageFromWorldY = useCallback(
      (pageIndex: number) => {
        if (items.length === 0) return;
        const index = Math.max(0, Math.min(items.length - 1, pageIndex));
        if (index === lastMountedPageRef.current) return;
        lastMountedPageRef.current = index;
        updateWindow(offsets[index] ?? 0);
        onScroll(Math.max(0, offsets[index] ?? 0));
      },
      [items.length, offsets, onScroll, updateWindow],
    );

    useEffect(() => {
      viewportWidth.value = viewport.width;
      viewportHeight.value = viewport.height;
      contentHeightValue.value = contentHeight;
      updateWindow(scrollY.value);
      // Viewport metrics are shared values; scrollY is read only for the
      // current window after a resize and must not retrigger this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      contentHeight,
      contentHeightValue,
      updateWindow,
      viewport.height,
      viewport.width,
      viewportHeight,
      viewportWidth,
    ]);

    const resetCamera = useCallback(() => {
      scale.value = 1;
      pinchStartScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      panStartX.value = 0;
      panStartY.value = 0;
      setZoomed(false);
    }, [
      panStartX,
      panStartY,
      pinchStartScale,
      scale,
      translateX,
      translateY,
    ]);

    const scrollToOffset = useCallback(
      (nextOffset: number, animated: boolean) => {
        const target = Math.max(0, nextOffset);
        scrollY.value = target;
        resetCamera();
        updateWindow(target);
        lastMountedPageRef.current = stripPageIndexForWorldY(offsets, target);
        scrollRef.current?.scrollTo({ y: target, animated });
      },
      [offsets, resetCamera, scrollY, updateWindow],
    );

    useEffect(() => {
      if (lastResetKeyRef.current === resetKey) return;
      lastResetKeyRef.current = resetKey;
      scrollToOffset(0, false);
    }, [resetKey, scrollToOffset]);

    useEffect(() => {
      updateWindow(scrollY.value);
      // See above: the window follows the current offset, not a scroll event.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length, offsets, updateWindow, viewport.height]);

    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (scale.value > MIN_CAMERA_SCALE) return;
        const offset = Math.max(0, event.nativeEvent.contentOffset.y);
        scrollY.value = offset;
        const pageIndex = stripPageIndexForWorldY(offsets, offset);
        updateWindow(offset);
        onScroll(Math.max(0, offsets[pageIndex] ?? offset));
      },
      [offsets, onScroll, scale, scrollY, updateWindow],
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollToOffset: ({ offset, animated = false }) =>
          scrollToOffset(offset, animated),
        scrollToIndex: ({ index, animated = false }) =>
          scrollToOffset(offsets[Math.max(0, index)] ?? 0, animated),
        stepByViewport: (direction) => {
          const delta =
            direction === "next"
              ? viewport.height * TAP_STEP_RATIO
              : -viewport.height * TAP_STEP_RATIO;
          scrollToOffset(scrollY.value + delta, true);
        },
      }),
      [offsets, scrollToOffset, scrollY, viewport.height],
    );

    const pinch = Gesture.Pinch()
      .onStart(() => {
        pinchStartScale.value = scale.value;
        runOnJS(setZoomed)(true);
      })
      .onUpdate((event) => {
        const nextScale = Math.min(
          MAX_CAMERA_SCALE,
          Math.max(MIN_CAMERA_SCALE, pinchStartScale.value * event.scale),
        );
        const nextTranslation = stripCameraTranslationForScale(
          workletMetrics(scale.value, scrollY.value),
          translateX.value,
          translateY.value,
          nextScale,
          event.focalX,
          event.focalY,
        );
        scale.value = nextScale;
        translateX.value = nextTranslation.x;
        translateY.value = nextTranslation.y;
      })
      .onEnd(() => {
        if (scale.value <= ZOOM_RESET_THRESHOLD) {
          runOnJS(resetCamera)();
          return;
        }
        pinchStartScale.value = scale.value;
        runOnJS(setZoomed)(true);
      });

    const pan = Gesture.Pan()
      .enabled(zoomed)
      .onStart(() => {
        panStartX.value = translateX.value;
        panStartY.value = translateY.value;
      })
      .onUpdate((event) => {
        const nextTranslation = clampStripCameraTranslation(
          workletMetrics(scale.value, scrollY.value),
          panStartX.value + event.translationX,
          panStartY.value + event.translationY,
        );
        translateX.value = nextTranslation.x;
        translateY.value = nextTranslation.y;
      })
      .onEnd(() => {
        panStartX.value = translateX.value;
        panStartY.value = translateY.value;
      });

    const cameraGesture = Gesture.Simultaneous(pinch, pan);

    const singleTap = Gesture.Tap()
      .maxDistance(TAP_TRAVEL_LIMIT)
      .onEnd((event) => {
        const world = stripCameraScreenPointToWorld(
          workletMetrics(scale.value, scrollY.value),
          translateX.value,
          translateY.value,
          event.x,
          event.y,
        );
        const index = stripPageIndexForWorldY(offsets, world.y);
        runOnJS(onTap)({ x: event.x, y: event.y, index });
      });

    const longPress = Gesture.LongPress()
      .minDuration(450)
      .maxDistance(14)
      .onStart((event) => {
        const world = stripCameraScreenPointToWorld(
          workletMetrics(scale.value, scrollY.value),
          translateX.value,
          translateY.value,
          event.x,
          event.y,
        );
        runOnJS(onLongPress)(stripPageIndexForWorldY(offsets, world.y));
      });

    const tapGesture = Gesture.Exclusive(longPress, singleTap);
    const composedGesture = Gesture.Simultaneous(cameraGesture, tapGesture);

    useAnimatedReaction(
      () => stripPageIndexForWorldY(offsets, scrollY.value),
      (pageIndex) => {
        runOnJS(syncPageFromWorldY)(pageIndex);
      },
    );

    const cameraStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    }));

    const indices = useMemo(() => {
      const next: number[] = [];
      for (
        let index = windowRange.start;
        index <= windowRange.end;
        index += 1
      ) {
        next.push(index);
      }
      return next;
    }, [windowRange.end, windowRange.start]);

    return (
      <View style={styles.viewport}>
        <GestureDetector gesture={composedGesture}>
          <View style={styles.viewport}>
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                width: viewport.width,
                height: contentHeight,
              }}
              scrollEnabled={!zoomed}
              scrollEventThrottle={16}
              onScroll={handleScroll}
              onScrollBeginDrag={onScrollBeginDrag}
              nestedScrollEnabled
              directionalLockEnabled
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              // The tap surface is the gesture target; keep one vertical
              // scroll owner and never start the native drag under a tap.
            >
              <Animated.View
                style={[
                  {
                    width: viewport.width,
                    height: contentHeight,
                    transformOrigin: "0% 0%",
                  },
                  cameraStyle,
                ]}
              >
                <View style={{ width: viewport.width, height: contentHeight }}>
                  {indices.map((index) => {
                    const item = items[index];
                    if (!item) return null;
                    return (
                      <View
                        key={item.key}
                        style={{
                          position: "absolute",
                          top: offsets[index] ?? 0,
                          left: 0,
                          width: viewport.width,
                        }}
                      >
                        {renderPage(item, index)}
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            </ScrollView>
            <View style={styles.tapSurface} collapsable={false} />
          </View>
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  tapSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});

export default StripReader;
