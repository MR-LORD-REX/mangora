/**
 * Page-change flash overlay.
 *
 * The Animated value and last-page guard stay together so the overlay can be
 * passed directly to the viewport without the screen owning animation state.
 */
import { useEffect, useRef } from "react";
import { Animated } from "react-native";

export interface ReaderPageFlashOptions {
  pageIndex: number;
  enabled: boolean;
}

export function useReaderPageFlash({
  pageIndex,
  enabled,
}: ReaderPageFlashOptions): Animated.Value {
  const opacity = useRef(new Animated.Value(0)).current;
  const lastPageIndexRef = useRef(pageIndex);

  useEffect(() => {
    if (lastPageIndexRef.current === pageIndex) return;
    lastPageIndexRef.current = pageIndex;
    if (!enabled) return;
    opacity.stopAnimation();
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 110,
      useNativeDriver: true,
    }).start();
  }, [enabled, opacity, pageIndex]);

  return opacity;
}