import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { DownloadSheetHost } from "@features/downloads";
import { AppBootstrapGate } from "@composition/providers/AppBootstrapGate";
import { appServices } from "@composition/providers/appServices";
import { MotionProvider } from "@shared/motion";
import {
  AppServicesProvider,
  OverlayHostProvider,
  enforceLtrLayout,
} from "@shared/runtime";
import { colors } from "@shared/theme";

import "../global.css";

enforceLtrLayout();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <MotionProvider>
          <AppServicesProvider services={appServices}>
            <AppBootstrapGate>
              <OverlayHostProvider>
                <View style={{ flex: 1, backgroundColor: colors.bg }}>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  />
                  <DownloadSheetHost />
                </View>
              </OverlayHostProvider>
            </AppBootstrapGate>
          </AppServicesProvider>
        </MotionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
