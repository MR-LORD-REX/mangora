/* Translation engine and mode tab. */

import { Pressable, Text, View } from "react-native";

import { SectionLabel } from "../ReaderPanelPrimitives";
import { styles } from "./styles";
import { ENGINE_OPTIONS, MODE_OPTIONS, type ReaderTranslationPanelProps } from "./types";

export default function ModeTab(props: ReaderTranslationPanelProps) {
  const {
    translationEngine,
    onSelectTranslationEngine,
    translationMode,
    onSelectTranslationMode,
  } = props;

  return (
    <View>
      <SectionLabel>Translation engine</SectionLabel>
      {ENGINE_OPTIONS.map((option) => {
        const active = translationEngine === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelectTranslationEngine(option.value)}
            style={[styles.modeCard, active && styles.modeCardActive]}
          >
            <View style={styles.modeCardHeader}>
              <Text
                style={[styles.modeCardTitle, active && { color: "#0ea5e9" }]}
              >
                {option.label}
              </Text>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
            </View>
            {active && (
              <Text style={styles.modeCardDescription}>
                {option.description}
              </Text>
            )}
          </Pressable>
        );
      })}

      <View style={{ height: 16 }} />
      <SectionLabel>Translation mode</SectionLabel>
      {MODE_OPTIONS.map((option) => {
        const active = translationMode === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelectTranslationMode(option.value)}
            style={[styles.modeCard, active && styles.modeCardActive]}
          >
            <View style={styles.modeCardHeader}>
              <Text
                style={[styles.modeCardTitle, active && { color: "#0ea5e9" }]}
              >
                {option.label}
              </Text>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
            </View>
            {active && (
              <Text style={styles.modeCardDescription}>
                {option.description}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}