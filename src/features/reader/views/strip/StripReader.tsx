import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  GestureDetector,
  Gesture,
  ScrollView as GestureScrollView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import type {
  StripReaderHandle,
  StripReaderProps,
  StripTapEvent,
} from "./StripReader.types";
import { useStripWindow } from "./useStripWindow";
import {
  clampStripCameraTranslation,
  stripCameraAtBase,
  stripCameraScreenPointToWorld,
  stripCameraTranslationForScale,
  stripCameraMetricsFor,
  stripPageIndexForWorldY,
  type StripCameraMetrics,
} from "./stripCamera";

export type {
  StripReaderHandle,
  StripReaderProps,
  StripTapEvent,
  StripViewportState,
} from "./StripReader.types";

const MAX_CAMERA_SCALE = 4;
const MIN_CAMERA_SCALE = 0.25;
const TAP_TRAVEL_LIMIT = 12;
const TAP_STEP_RATIO = 0.35;


const StripReader = forwardRef<StripReaderHandle, StripReaderProps>(
  function StripReader(
    {
      items,
      offsets,
      viewport,
      resetKey,
      initialOffset = 0,
      onScroll,
      onScrollOffset,
      onViewportChange,
      onScrollBeginDrag,
      onTap,
      onLongPress,
      renderPage,
    },
    ref,
  ) {
    const scrollRef = useRef<GestureScrollView>(null);
    const scrollOffsetRef = useRef(Math.max(0, initialOffset));
    const lastResetKeyRef = useRef(resetKey);
    const [cameraAtBase, setCameraAtBase] = useState(true);

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

    const {
      indices,
      updateWindow,
      applyCameraWindow,
      syncCameraWindow,
    } = useStripWindow({
      offsets,
      itemCount: items.length,
      initialOffset,
      viewport,
      contentHeight,
      onScroll,
    });

    const workletMetrics = useCallback(
      (
        currentScale: number,
        currentScrollY: number,
      ): StripCameraMetrics => {
        "worklet";
        return stripCameraMetricsFor(
          currentScale,
          currentScrollY,
          { width: viewportWidth.value, height: viewportHeight.value },
          contentHeightValue.value,
        );
      },
      [contentHeightValue, viewportHeight, viewportWidth],
    );

    const onTapRef = useRef(onTap);
    const onLongPressRef = useRef(onLongPress);
    const onScrollOffsetRef = useRef(onScrollOffset);
    const onViewportChangeRef = useRef(onViewportChange);
    useEffect(() => {
      onTapRef.current = onTap;
      onLongPressRef.current = onLongPress;
      onScrollOffsetRef.current = onScrollOffset;
      onViewportChangeRef.current = onViewportChange;
    }, [onLongPress, onScrollOffset, onViewportChange, onTap]);

    const dispatchTap = useCallback((event: StripTapEvent) => {
      onTapRef.current(event);
    }, []);
    const dispatchLongPress = useCallback((index: number) => {
      onLongPressRef.current(index);
    }, []);

    const notifyViewportChange = useCallback(
      (offset: number, currentScale: number, interacting: boolean) => {
        onViewportChangeRef.current?.({
          offset: Math.max(0, offset),
          atBase: stripCameraAtBase(currentScale),
          interacting,
        });
      },
      [],
    );

    useEffect(() => {
      viewportWidth.value = viewport.width;
      viewportHeight.value = viewport.height;
      contentHeightValue.value = contentHeight;
      syncCameraWindow(scale.value, scrollY.value, translateY.value);
      // Viewport metrics are shared values; scrollY is read only for the
      // current window after a resize and must not retrigger this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      contentHeight,
      contentHeightValue,
      scale,
      syncCameraWindow,
      translateY,
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
      setCameraAtBase(true);
      notifyViewportChange(scrollY.value, 1, false);
    }, [
      notifyViewportChange,
      panStartX,
      panStartY,
      pinchStartScale,
      scale,
      translateX,
      translateY,
      scrollY,
    ]);

    const scrollToOffset = useCallback(
      (nextOffset: number, animated: boolean, keepCamera = true) => {
        const target = Math.max(0, nextOffset);
        scrollY.value = target;
        if (!keepCamera) resetCamera();
        const bounded = clampStripCameraTranslation(
          stripCameraMetricsFor(scale.value, target, viewport, contentHeight),
          translateX.value,
          translateY.value,
        );
        translateX.value = bounded.x;
        translateY.value = bounded.y;
        syncCameraWindow(scale.value, target, bounded.y);
        scrollRef.current?.scrollTo({ y: target, animated });
      },
      [
        contentHeight,
        resetCamera,
        scale,
        scrollY,
        syncCameraWindow,
        translateX,
        translateY,
        viewport,
      ],
    );

    useEffect(() => {
      if (lastResetKeyRef.current === resetKey) return;
      lastResetKeyRef.current = resetKey;
      scrollToOffset(0, false, false);
    }, [resetKey, scrollToOffset]);

    useEffect(() => {
      syncCameraWindow(scale.value, scrollY.value, translateY.value);
      // See above: the window follows the current offset, not a scroll event.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      items.length,
      offsets,
      scale,
      syncCameraWindow,
      translateY,
      viewport.height,
    ]);

    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offset = Math.max(0, event.nativeEvent.contentOffset.y);
        scrollOffsetRef.current = offset;
        if (scale.value !== 1) return;
        scrollY.value = offset;
        onScroll(offset);
        onScrollOffsetRef.current?.(offset);
        const pageIndex = stripPageIndexForWorldY(offsets, offset);
        updateWindow(offset, pageIndex);
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
          const baseDelta =
            direction === "next"
              ? viewport.height * TAP_STEP_RATIO
              : -viewport.height * TAP_STEP_RATIO;
          const delta = baseDelta / Math.max(MIN_CAMERA_SCALE, scale.value);
          scrollToOffset(scrollY.value + delta, true);
        },
        getScrollMetrics: () => {
          const viewportHeightPx = Math.max(0, viewport.height);
          return {
            offset: Math.max(0, scrollOffsetRef.current),
            maxOffset: Math.max(0, contentHeight - viewportHeightPx),
          };
        },
      }),
      [contentHeight, offsets, scale, scrollToOffset, scrollY, viewport.height],
    );

    const composedGesture = useMemo(() => {
      const pinch = Gesture.Pinch()
        .onStart(() => {
          pinchStartScale.value = scale.value;
          runOnJS(setCameraAtBase)(stripCameraAtBase(scale.value));
          runOnJS(notifyViewportChange)(scrollY.value, scale.value, true);
        })
        .onUpdate((event) => {
          const nextScale = Math.min(
            MAX_CAMERA_SCALE,
            Math.max(
              MIN_CAMERA_SCALE,
              pinchStartScale.value * event.scale,
            ),
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
        .onFinalize(() => {
          if (stripCameraAtBase(scale.value)) {
            scale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
          }
          pinchStartScale.value = scale.value;
          runOnJS(setCameraAtBase)(stripCameraAtBase(scale.value));
          runOnJS(notifyViewportChange)(scrollY.value, scale.value, false);
        });

      const pan = Gesture.Pan()
        .enabled(!cameraAtBase)
        .onStart(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
          runOnJS(notifyViewportChange)(scrollY.value, scale.value, true);
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
        .onFinalize(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
          runOnJS(setCameraAtBase)(stripCameraAtBase(scale.value));
          runOnJS(notifyViewportChange)(scrollY.value, scale.value, false);
        });

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
          runOnJS(dispatchTap)({ x: event.x, y: event.y, index });
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
          runOnJS(dispatchLongPress)(
            stripPageIndexForWorldY(offsets, world.y),
          );
        });

      return Gesture.Simultaneous(
        pinch,
        pan,
        Gesture.Exclusive(longPress, singleTap),
      );
    }, [
      cameraAtBase,
      dispatchLongPress,
      dispatchTap,
      offsets,
      panStartX,
      panStartY,
      pinchStartScale,
      notifyViewportChange,
      scale,
      scrollY,
      translateX,
      translateY,
      workletMetrics,
    ]);

    useAnimatedReaction(
      () => {
        const cameraScale = Math.max(0.01, scale.value);
        const visibleOffset = Math.max(
          0,
          (scrollY.value - translateY.value) / cameraScale,
        );
        const indexForWorldY = (worldY: number) => {
          if (offsets.length <= 1) return 0;
          const pageCount = offsets.length - 1;
          let low = 0;
          let high = pageCount - 1;
          while (low < high) {
            const middle = (low + high) >> 1;
            if (
              (offsets[middle + 1] ?? Number.POSITIVE_INFINITY) > worldY
            ) {
              high = middle;
            } else {
              low = middle + 1;
            }
          }
          return Math.max(0, Math.min(pageCount - 1, low));
        };
        const pageIndex = indexForWorldY(visibleOffset);
        const visibleHeight = viewportHeight.value / cameraScale;
        const overscan = Math.max(
          2,
          Math.ceil(cameraScale <= 1 ? 2 : 2 / cameraScale),
        );
        const start = Math.max(
          0,
          indexForWorldY(visibleOffset) - overscan,
        );
        const end = Math.min(
          Math.max(0, items.length - 1),
          indexForWorldY(visibleOffset + visibleHeight) + overscan,
        );
        return {
          start,
          end,
          pageIndex,
        };
      },
      (current, previous) => {
        if (
          previous &&
          previous.start === current.start &&
          previous.end === current.end &&
          previous.pageIndex === current.pageIndex
        ) {
          return;
        }
        runOnJS(applyCameraWindow)(
          current.start,
          current.end,
          current.pageIndex,
        );
      },
      [
        applyCameraWindow,
        items.length,
        offsets,
        scale,
        scrollY,
        translateY,
        viewportHeight,
      ],
    );

    const cameraStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    }));


    return (
      <View style={styles.viewport}>
        <GestureDetector gesture={composedGesture}>
          <View style={styles.viewport} collapsable={false}>
            <GestureScrollView
                ref={scrollRef}
                style={styles.viewport}
                contentContainerStyle={{
                  width: viewport.width,
                  height: contentHeight,
                }}
                scrollEnabled={cameraAtBase}
                scrollEventThrottle={16}
                onScroll={handleScroll}
                onScrollBeginDrag={onScrollBeginDrag}
                nestedScrollEnabled
                directionalLockEnabled
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
              <Animated.View
                collapsable={false}
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
            </GestureScrollView>
          </View>
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  viewport: { flex: 1 },
});

export default StripReader;
