/* Language tab for the reader translation sheet. */

import { Check, ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { READER_TARGET_OPTIONS } from "@features/translation";
import { READER_LANGUAGE_OPTIONS } from "../readerLanguages";
import { HelperText, SectionLabel } from "../ReaderPanelPrimitives";
import { styles } from "./styles";
import type { ReaderTranslationPanelProps } from "./types";

export default function LanguageTab(props: ReaderTranslationPanelProps) {
  const {
    readerLanguage,
    ocrLanguage,
    autoLanguage,
    targetLanguage,
    onSelectReaderLanguage,
    onSelectTargetLanguage,
  } = props;
  const [sourceOpen, setSourceOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const selectedSource =
    READER_LANGUAGE_OPTIONS.find(
      (option) => (readerLanguage || "") === option.code,
    ) ?? READER_LANGUAGE_OPTIONS[0];
  const selectedTarget =
    READER_TARGET_OPTIONS.find((option) => targetLanguage === option.code) ??
    READER_TARGET_OPTIONS[0];

  return (
    <View>
      <SectionLabel>Source language</SectionLabel>
      <Text style={styles.columnCaption}>OCR language for detected text</Text>
      <Pressable
        onPress={() => setSourceOpen((open) => !open)}
        style={styles.languagePicker}
      >
        <View style={styles.rowText}>
          <Text
            style={[styles.rowLabel, { color: "#fbbf24" }]}
            numberOfLines={1}
          >
            {selectedSource?.label ?? "Select source language"}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {selectedSource?.detail}
          </Text>
        </View>
        {sourceOpen ? (
          <ChevronUp size={18} color="#fbbf24" />
        ) : (
          <ChevronDown size={18} color="#fbbf24" />
        )}
      </Pressable>
      {sourceOpen && (
        <ScrollView
          style={styles.languageList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {READER_LANGUAGE_OPTIONS.map((option) => {
            const active = (readerLanguage || "") === option.code;
            return (
              <Pressable
                key={option.code || "auto"}
                onPress={() => {
                  onSelectReaderLanguage(option.code);
                  setSourceOpen(false);
                }}
                style={[styles.optionRow, active && styles.optionRowActive]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowLabel, active && { color: "#fbbf24" }]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>
                    {option.detail}
                  </Text>
                </View>
                {active && <Check size={18} color="#34d399" />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <HelperText>
        Sent to OCR as {ocrLanguage} (auto: {autoLanguage}).
      </HelperText>

      <SectionLabel>Target language</SectionLabel>
      <Text style={styles.columnCaption}>Translate into</Text>
      <Pressable
        onPress={() => setTargetOpen((open) => !open)}
        style={styles.languagePicker}
      >
        <View style={styles.rowText}>
          <Text
            style={[styles.rowLabel, { color: "#38bdf8" }]}
            numberOfLines={1}
          >
            {selectedTarget?.label ?? "Select target language"}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {selectedTarget?.detail || "Translate into"}
          </Text>
        </View>
        {targetOpen ? (
          <ChevronUp size={18} color="#38bdf8" />
        ) : (
          <ChevronDown size={18} color="#38bdf8" />
        )}
      </Pressable>
      {targetOpen && (
        <ScrollView
          style={styles.languageList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {READER_TARGET_OPTIONS.map((option) => {
            const active = targetLanguage === option.code;
            return (
              <Pressable
                key={option.code}
                onPress={() => {
                  onSelectTargetLanguage(option.code);
                  setTargetOpen(false);
                }}
                style={[styles.optionRow, active && styles.optionRowActive]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowLabel, active && { color: "#38bdf8" }]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>
                    {option.detail || "Translate into"}
                  </Text>
                </View>
                {active && <Check size={18} color="#34d399" />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <HelperText>
        Translation is skipped when the target matches the source language.
      </HelperText>
    </View>
  );
}
