import type { EasingFunction } from "react-native";

/** Shared timings for UI motion outside the reader viewport. */
export const motion = {
  durations: {
    press: 110,
    fade: 160,
    sheet: 220,
    banner: 180,
  },
  pressScale: 0.97,
  sheetOffset: 36,
  bannerOffset: 8,
} as const;

export type MotionTiming = {
  duration: number;
  easing: EasingFunction;
};
