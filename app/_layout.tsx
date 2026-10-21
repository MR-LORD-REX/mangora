import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";


import DownloadSheetHost from "@/components/downloader/DownloadSheetHost";
import { colors } from "@/constants/theme";
import { initializeDatabase } from "@/services/db/bootstrap";
import { initializeReaderCache } from "@/services/reader/readerCache";
import { initializeNotifications } from "@/services/notifications/notifications";
import { initPretranslateQueue } from "@/services/translation/pretranslateQueue";
import {
  initDownloadScheduler,
  refreshDownloadedMetadata,
} from "@/services/downloader";
import { syncAllLibraries } from "@/services/library/librarySync";
import { refreshExtensionRegistry } from "@/services/extensions/registry";

import "@/global.css";

void SplashScreen.preventAutoHideAsync();

/** Throttle for the foreground metadata refresh (30 minutes). */
let lastMetadataRefresh = Date.now();

export default function RootLayout() {
  const [databaseState, setDatabaseState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const syncStarted = useRef(false);

  const initialize = () => {
    setDatabaseState("loading");
    initializeDatabase()
      .then(async () => {
        await initializeReaderCache().catch((error) => {
          console.warn("Reader cache failed to initialise:", error);
        });
        await initDownloadScheduler().catch((error) => {
          console.warn("Download queue failed to start:", error);
        });
      })
      .then(() => setDatabaseState("ready"))
      .catch(() => setDatabaseState("error"));
  };

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (databaseState !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [databaseState]);

  // Refresh library data once per app start; afterwards it only happens
  // when the user taps "Update library" from the Library screen.
  useEffect(() => {
    if (databaseState !== "ready" || syncStarted.current) return;
    syncStarted.current = true;
    void refreshExtensionRegistry().catch((error) => {
      console.warn("Extension registry refresh failed:", error);
    });
    syncAllLibraries().catch((error) => {
      console.warn("Startup library sync failed:", error);
    });
    // Refresh the offline metadata snapshots for downloaded manga too.
    void refreshDownloadedMetadata();
  }, [databaseState]);

  // Ask for the notification permission on start (downloads still work when
  // it is refused; the foreground notification is simply hidden).
  useEffect(() => {
    if (databaseState !== "ready") return;
    void initializeNotifications();
    void initPretranslateQueue().catch((error) => {
      console.warn("Translation queue failed to start:", error);
    });
  }, [databaseState]);

  // Re-sync downloaded-manga metadata when the app comes back to the front,
  // throttled so a quick app switch does not hammer the providers.
  useEffect(() => {
    if (databaseState !== "ready") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastMetadataRefresh < 30 * 60 * 1000) return;
      lastMetadataRefresh = now;
      void refreshDownloadedMetadata();
    });
    return () => subscription.remove();
  }, [databaseState]);

  if (databaseState !== "ready") {
    if (databaseState === "loading") return null;

    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
          padding: 24,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 16, marginBottom: 12 }}>
          Could not open the app database.
        </Text>

        <Pressable
          onPress={initialize}
          style={{
            backgroundColor: colors.accent,
            borderRadius: 10,
            paddingHorizontal: 18,
            paddingVertical: 11,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
        <DownloadSheetHost />
      </View>
    </GestureHandlerRootView>
  );
}
