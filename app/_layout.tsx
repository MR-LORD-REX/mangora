import { Stack } from "expo-router";
import React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { DownloadSheetHost } from "@features/downloads";
import { AppBootstrapGate } from "@composition/providers/AppBootstrapGate";
import { appServices } from "@composition/providers/appServices";
import { AppServicesProvider, OverlayHostProvider } from "@shared/runtime";
import { colors } from "@shared/theme";

import "@/global.css";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
