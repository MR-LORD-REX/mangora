import { Copy, Search } from "lucide-react-native";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import type { SharedTag } from "@shared/contracts";
import { colors, radius } from "@shared/theme";

const POPOVER_WIDTH = 184;
const POPOVER_HEIGHT = 104;

export interface TagPopoverAnchor {
  tag: SharedTag;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TagPopoverProps {
  anchor: TagPopoverAnchor | null;
  onClose: () => void;
  onCopy: () => void;
  onSearch: () => void;
}

export default function TagPopover({
  anchor,
  onClose,
  onCopy,
  onSearch,
}: TagPopoverProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  return (
    <Modal
      visible={anchor != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.layer}>
        <Pressable
          accessibilityLabel="Close tag actions"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        {anchor ? (
          <View
            style={[
              styles.popover,
              {
                left: Math.max(
                  12,
                  Math.min(
                    anchor.x + anchor.width / 2 - POPOVER_WIDTH / 2,
                    windowWidth - POPOVER_WIDTH - 12,
                  ),
                ),
                top:
                  anchor.y +
                    anchor.height +
                    POPOVER_HEIGHT +
                    8 <=
                  windowHeight - 12
                    ? anchor.y + anchor.height + 8
                    : Math.max(12, anchor.y - POPOVER_HEIGHT - 8),
              },
            ]}
          >
            <Text style={styles.title} numberOfLines={1}>
              {anchor.tag.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onCopy}
              style={({ pressed }) => [
                styles.action,
                pressed && styles.pressed,
              ]}
            >
              <Copy color={colors.text} size={16} />
              <Text style={styles.actionText}>Copy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onSearch}
              style={({ pressed }) => [
                styles.action,
                pressed && styles.pressed,
              ]}
            >
              <Search color={colors.text} size={16} />
              <Text style={styles.actionText}>Search</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  popover: {
    position: "absolute",
    width: POPOVER_WIDTH,
    minHeight: POPOVER_HEIGHT,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  action: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  actionText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
