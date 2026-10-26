import { Stack } from "expo-router";
import React from "react";

import { colors } from "@shared/theme";

/** Settings sub-pages are full-screen; each page renders its own header. */
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}