import { Tabs } from "expo-router";
import {
    Compass,
    History,
    Library,
    Settings,
} from "lucide-react-native";

import { useAppMotion } from "@shared/motion";
import { colors } from "@shared/theme";
import "../../global.css";

export default function RootLayout() {
  const { reduceMotion } = useAppMotion();

  return (
    <Tabs
      initialRouteName="library"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        animation: reduceMotion ? "none" : "fade",
        transitionSpec: reduceMotion
          ? undefined
          : { animation: "timing", config: { duration: 180 } },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => (
            <Library color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <History color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, size }) => (
            <Compass color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Settings color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
