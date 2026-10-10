/**
 * SettingsPrimitives.tsx
 * ---------------------------------------------------------------------------
 * Building blocks shared by every Settings section: section cards, rows,
 * toggles, sliders and inline actions. Kept deliberately small so the section
 * files stay readable.
 * ---------------------------------------------------------------------------
 */

import { ChevronRight } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { colors, radius } from "@/constants/theme";

import RangeSlider from "./RangeSlider";

export function SettingsSection({
  title,
  subtitle,
  icon: Icon,
  children,
  standalone = false,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  /** On a dedicated page the screen header already shows the title. */
  standalone?: boolean;
}) {
  return (
    <View style={[styles.section, standalone && styles.sectionStandalone]}>
      {standalone ? null : (
        <>
          <View style={styles.sectionHead}>
            {Icon ? <Icon color={colors.accent} size={16} /> : null}
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {subtitle ? (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </>
      )}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  icon: Icon,
  title,
  subtitle,
  right,
  onPress,
  disabled,
  destructive,
  last,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Hides the divider for the final row of a card. */
  last?: boolean;
}) {
  const content = (
    <>
      {Icon ? (
        <View style={styles.rowIcon}>
          <Icon
            color={destructive ? colors.danger : colors.accent}
            size={18}
          />
        </View>
      ) : null}
      <View style={styles.rowBody}>
        <Text
          style={[
            styles.rowTitle,
            destructive && { color: colors.danger },
            disabled && styles.disabledText,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, !last && styles.rowDivider]}>{content}</View>
    );
  }
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {content}
      <ChevronRight color={colors.textFaint} size={18} />
    </Pressable>
  );
}

export function ToggleRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onChange,
  last,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <SettingsRow
      icon={Icon}
      title={title}
      subtitle={subtitle}
      last={last}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={value ? colors.onAccent : colors.textFaint}
        />
      }
    />
  );
}

export function SettingsValue({
  text,
  accent = false,
}: {
  text: string;
  accent?: boolean;
}) {
  return (
    <Text
      style={[styles.value, accent && { color: colors.accent }]}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

/** Label + current value on top of a 1-per-step slider. */
export function SliderRow({
  icon: Icon,
  title,
  subtitle,
  value,
  min,
  max,
  step = 1,
  formatValue,
  onChange,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onChange: (next: number) => void;
}) {
  return (
    <View>
      <SettingsRow
        icon={Icon}
        title={title}
        subtitle={subtitle}
        right={
          <SettingsValue
            text={formatValue ? formatValue(value) : `${value}`}
            accent
          />
        }
      />
      <RangeSlider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </View>
  );
}

export function InlineActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.inlineActions}>{children}</View>;
}

export function ActionPill({
  label,
  icon: Icon,
  onPress,
  disabled,
  busy,
  destructive,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
}) {
  const tint = destructive ? colors.danger : colors.accent;
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        destructive && styles.pillDestructive,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tint} size="small" />
      ) : Icon ? (
        <Icon color={tint} size={15} />
      ) : null}
      <Text style={[styles.pillLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  sectionStandalone: { marginTop: 12 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  sectionSubtitle: {
    color: colors.textFaint,
    fontSize: 12,
    paddingHorizontal: 16,
    marginTop: 3,
    lineHeight: 17,
  },
  card: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowSubtitle: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  value: { color: colors.textMuted, fontSize: 13, fontWeight: "600", maxWidth: 190 },
  disabled: { opacity: 0.45 },
  disabledText: { color: colors.textFaint },
  pressed: { opacity: 0.7 },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  pillDestructive: { borderColor: colors.dangerSoft },
  pillLabel: { fontSize: 13, fontWeight: "700" },
});
