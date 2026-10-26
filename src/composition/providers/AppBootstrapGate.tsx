import * as SplashScreen from "expo-splash-screen";
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import {
  refreshDownloadedMetadataOnForeground,
  startAppRuntime,
  startBackgroundServices,
} from "@composition/providers/bootstrapRuntime";
import { useAppServices } from "@shared/runtime";
import { colors } from "@shared/theme";

type DatabaseState = "loading" | "ready" | "error";

export function AppBootstrapGate({ children }: { children: ReactNode }) {
  const services = useAppServices();
  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");
  const syncStarted = useRef(false);

  const initialize = useCallback(() => {
    setDatabaseState("loading");
    startAppRuntime()
      .then(() => setDatabaseState("ready"))
      .catch(() => setDatabaseState("error"));
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (databaseState !== "loading") void SplashScreen.hideAsync();
  }, [databaseState]);

  useEffect(() => {
    if (databaseState !== "ready" || syncStarted.current) return;
    syncStarted.current = true;
    startBackgroundServices(services);
  }, [databaseState, services]);

  useEffect(() => {
    if (databaseState !== "ready") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshDownloadedMetadataOnForeground(services);
      }
    });
    return () => subscription.remove();
  }, [databaseState, services]);

  if (databaseState === "loading") return null;

  if (databaseState === "error") {
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

  return <>{children}</>;
}
