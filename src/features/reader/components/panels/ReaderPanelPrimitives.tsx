/**
 * ReaderPanelPrimitives.tsx
 * ---------------------------------------------------------------------------
 * Low-level UI building blocks shared by the reader's quick sheets and the
 * tabbed settings panel (Pill, CheckRow, SectionLabel, TabBar). Lifted from
 * demo.tsx.
 * ---------------------------------------------------------------------------
 */

import { Check } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAppMotion } from "@shared/motion";

import {
  READER_ACCENT,
  READER_ON_ACCENT,
  READER_PILL_BG,
  READER_PILL_BG_SELECTED,
  READER_PILL_BORDER,
  READER_TEXT_MUTED,
} from "./readerTheme";

export function Pill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pill,
        selected && styles.pillSelected,
        disabled && styles.pillDisabled,
      ]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CheckRow({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={[styles.checkRow, disabled && styles.pillDisabled]}
      onPress={onToggle}
      disabled={disabled}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && (
          <Check color={READER_ON_ACCENT} size={14} strokeWidth={3} />
        )}
      </View>
      <Text style={styles.checkRowLabel}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function HelperText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.helperText}>{children}</Text>;
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (tab: T) => void;
}) {
  const { reduceMotion } = useAppMotion();
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );
  const position = useRef(new Animated.Value(activeIndex)).current;
  const tabWidth = tabs.length > 0 ? barWidth / tabs.length : 0;

  useEffect(() => {
    if (!tabWidth) return;
    position.stopAnimation();
    if (reduceMotion) {
      position.setValue(activeIndex);
      return;
    }
    const animation = Animated.spring(position, {
      toValue: activeIndex,
      damping: 20,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [activeIndex, position, reduceMotion, tabWidth]);

  const translateX = position.interpolate({
    inputRange: [0, Math.max(1, tabs.length - 1)],
    outputRange: [
      tabWidth * 0.15,
      tabWidth * Math.max(0, tabs.length - 1) + tabWidth * 0.15,
    ],
  });

  return (
    <View
      style={styles.tabBar}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setBarWidth((current) => (current === width ? current : width));
      }}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          style={styles.tabItem}
          onPress={() => onChange(tab.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.key }}
        >
          <Text
            style={[
              styles.tabLabel,
              active === tab.key && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabUnderline,
            { width: tabWidth * 0.7, transform: [{ translateX }] },
          ]}
        />
      ) : null}
    </View>
  );
}

export function TabContentTransition({
  activeIndex,
  children,
}: {
  activeIndex: number;
  children: React.ReactNode;
}) {
  const { reduceMotion } = useAppMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const previousIndex = useRef(activeIndex);
  const initialIndexRef = useRef(activeIndex);

  useEffect(() => {
    if (activeIndex === previousIndex.current) {
      if (activeIndex === initialIndexRef.current) {
        initialIndexRef.current = -1;
      }
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }

    const direction = activeIndex >= previousIndex.current ? 1 : -1;
    previousIndex.current = activeIndex;
    opacity.stopAnimation();
    translateX.stopAnimation();
    if (reduceMotion) {
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateX.setValue(direction * 14);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [activeIndex, opacity, reduceMotion, translateX]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: READER_PILL_BG,
    borderWidth: 1,
    borderColor: READER_PILL_BORDER,
  },
  pillSelected: {
    backgroundColor: READER_PILL_BG_SELECTED,
    borderColor: "#565b8c",
  },
  pillDisabled: { opacity: 0.35 },
  pillText: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
  pillTextSelected: { color: "#fff" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#565b6e",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: READER_ACCENT,
    borderColor: READER_ACCENT,
  },
  checkRowLabel: { color: "#e5e7eb", fontSize: 14 },
  sectionLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 10,
  },
  helperText: { color: READER_TEXT_MUTED, fontSize: 12, marginBottom: 10 },
  tabBar: { flex: 1, flexDirection: "row", position: "relative" },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 12 },
  tabLabel: { color: READER_TEXT_MUTED, fontSize: 13, fontWeight: "600" },
  tabLabelActive: { color: "#fff" },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: READER_ACCENT,
  },
});
