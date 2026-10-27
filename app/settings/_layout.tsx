import { Stack } from "expo-router";
import React from "react";

import { useAppMotion } from "@shared/motion";
import { colors } from "@shared/theme";

/** Settings sub-pages are full-screen; each page renders its own header. */
export default function SettingsLayout() {
  const { reduceMotion } = useAppMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? "none" : "fade",
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}