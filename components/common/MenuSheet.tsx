import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { colors, radius } from "@/constants/theme";

export interface MenuOption {
  key: string;
  label: string;
  icon?: LucideIcon;
  selected?: boolean;
  destructive?: boolean;
  onPress?: () => void;
}

interface MenuSheetProps {
  visible: boolean;
  title?: string;
  options: MenuOption[];
  onClose: () => void;
}

/** Bottom sheet style action menu used by the three-dot buttons. */
export default function MenuSheet({
  visible,
  title,
  options,
  onClose,
}: MenuSheetProps) {
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(44);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [opacity, translateY, visible]);

  const choose = (option: MenuOption) => {
    onClose();
    option.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { opacity, transform: [{ translateY }] }]}
        >
          <Pressable onPress={() => {}}>
            <View style={styles.handle} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <ScrollView bounces={false} contentContainerStyle={styles.scroll}>
              {options.map((option) => {
                const Icon = option.icon;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => choose(option)}
                    style={({ pressed }) => [
                      styles.option,
                      option.selected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={styles.optionLeft}>
                      {Icon ? (
                        <Icon
                          size={20}
                          color={
                            option.destructive
                              ? colors.danger
                              : option.selected
                                ? colors.accent
                                : colors.textMuted
                          }
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.optionText,
                          option.destructive && styles.optionTextDestructive,
                          option.selected && styles.optionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </View>
                    {option.selected ? <View style={styles.checkDot} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 8,
    paddingBottom: 28,
    maxHeight: "72%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 6,
  },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scroll: { paddingBottom: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    gap: 12,
  },
  optionSelected: { backgroundColor: colors.accentSoft },
  optionPressed: { opacity: 0.7 },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  optionText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  optionTextSelected: { color: colors.accent },
  optionTextDestructive: { color: colors.danger },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
