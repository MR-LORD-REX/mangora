/* Overlay visibility and typography controls. */

import { Pressable, Switch, Text, View, type TextStyle } from "react-native";

import { OVERLAY_FONT_OPTIONS, overlayFontFamily, overlayFontSupportsLanguage, useOverlayFonts } from "../overlayFonts";
import { SectionLabel } from "../ReaderPanelPrimitives";
import DotSlider from "../DotSlider";
import { styles } from "./styles";
import type { ReaderTranslationPanelProps } from "./types";

export default function OverlayTab(props: ReaderTranslationPanelProps) {
  const {
    overlayFont,
    onChangeOverlayFont,
    overlayFontWeight,
    onChangeOverlayFontWeight,
    overlayFontScale,
    onChangeOverlayFontScale,
    overlayTextColor,
    onChangeOverlayTextColor,
    showPageStatus,
    onChangeShowPageStatus,
    hideTranslated,
    onChangeHideTranslated,
    targetLanguage,
  } = props;
  const fontsLoaded = useOverlayFonts();
  const supported = overlayFontSupportsLanguage(targetLanguage);
  const effectiveFont = supported ? overlayFont : "default";
  const rgb = hexToRgb(overlayTextColor);
  const setChannel = (channel: "r" | "g" | "b", value: number) => {
    onChangeOverlayTextColor(
      rgbToHex({ ...rgb, [channel]: Math.round(value) }),
    );
  };

  return (
    <View>
      <SectionLabel>Visibility</SectionLabel>
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextWrap}>
          <Text style={styles.toggleLabel}>Show page status</Text>
          <Text style={styles.toggleDetail}>
            Animated OCR / translation status on each page.
          </Text>
        </View>
        <Switch
          value={showPageStatus}
          onValueChange={onChangeShowPageStatus}
          trackColor={{ false: "#33354a", true: "#0ea5e9" }}
          thumbColor="#f8fafc"
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextWrap}>
          <Text style={styles.toggleLabel}>Hide translated</Text>
          <Text style={styles.toggleDetail}>
            Hide overlays on pages that already finished translating.
          </Text>
        </View>
        <Switch
          value={hideTranslated}
          onValueChange={onChangeHideTranslated}
          trackColor={{ false: "#33354a", true: "#0ea5e9" }}
          thumbColor="#f8fafc"
        />
      </View>

      <SectionLabel>Preview</SectionLabel>
      <View style={styles.overlayPreviewCard}>
        <Text
          allowFontScaling={false}
          style={{
            color: overlayTextColor,
            fontFamily: overlayFontFamily(
              effectiveFont,
              fontsLoaded,
              overlayFontWeight,
            ),
            fontWeight: String(overlayFontWeight) as TextStyle["fontWeight"],
            fontSize: 20 * Math.min(1.5, Math.max(0.5, overlayFontScale || 1)),
            textAlign: "center",
          }}
        >
          The quick brown fox jumps over the lazy dog.
        </Text>
      </View>

      <SectionLabel>Font style</SectionLabel>
      <View style={styles.fontRadioGroup}>
        {OVERLAY_FONT_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => onChangeOverlayFont(option.key)}
            style={styles.fontRadioRow}
          >
            <View
              style={[
                styles.radio,
                overlayFont === option.key && styles.radioActive,
              ]}
            >
              {overlayFont === option.key && <View style={styles.radioDot} />}
            </View>
            <Text
              style={[
                styles.fontRadioLabel,
                {
                  fontFamily: overlayFontFamily(option.key, fontsLoaded),
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionLabel>Font weight</SectionLabel>
      <View style={styles.overlaySlider}>
        <View style={styles.overlaySliderHeader}>
          <Text style={styles.overlaySliderLabel}>Weight</Text>
          <Text style={styles.overlaySliderValue}>{overlayFontWeight}</Text>
        </View>
        <DotSlider
          value={overlayFontWeight}
          min={400}
          max={900}
          step={100}
          leftLabel="400"
          rightLabel="900"
          onChange={onChangeOverlayFontWeight}
        />
      </View>

      <SectionLabel>Font size</SectionLabel>
      <View style={styles.overlaySlider}>
        <View style={styles.overlaySliderHeader}>
          <Text style={styles.overlaySliderLabel}>Scale</Text>
          <Text style={styles.overlaySliderValue}>
            {Math.round((overlayFontScale || 1) * 100)}%
          </Text>
        </View>
        <DotSlider
          value={overlayFontScale || 1}
          min={0.5}
          max={1.5}
          step={0.05}
          leftLabel="50%"
          rightLabel="150%"
          onChange={onChangeOverlayFontScale}
        />
      </View>

      <SectionLabel>Text color</SectionLabel>
      <RGBSlider
        channel="R"
        value={rgb.r}
        onChange={(value) => setChannel("r", value)}
      />
      <RGBSlider
        channel="G"
        value={rgb.g}
        onChange={(value) => setChannel("g", value)}
      />
      <RGBSlider
        channel="B"
        value={rgb.b}
        onChange={(value) => setChannel("b", value)}
      />
      <View style={styles.tintPreviewRow}>
        <View
          style={[styles.tintPreview, { backgroundColor: overlayTextColor }]}
        />
        <Text style={styles.overlaySliderValue}>{overlayTextColor}</Text>
      </View>

      {/* <HelperText>
        Bubble text uses 85% of the detected bubble area (centred, with a
        readable minimum) and auto-fits the font size. Target language:{" "}
        {targetLanguageLabel}.
        {supported
          ? ""
          : " This target script is not supported by the display fonts, so the system font is used."}
      </HelperText> */}

      {/* <SectionLabel>Translation behaviour</SectionLabel>
      <HelperText>
        Translated pages are cached on-device (source + coordinates + result).
        Re-opening a page that was already translated into the current target
        language restores it instantly without OCR or an API call.
      </HelperText> */}
    </View>
  );
}

function RGBSlider({
  channel,
  value,
  onChange,
}: {
  channel: "R" | "G" | "B";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.overlaySlider}>
      <View style={styles.overlaySliderHeader}>
        <Text style={styles.overlaySliderLabel}>{channel}</Text>
        <Text style={styles.overlaySliderValue}>{Math.round(value)}</Text>
      </View>
      <DotSlider
        value={value}
        min={0}
        max={255}
        step={5}
        leftLabel="0"
        rightLabel="255"
        onChange={onChange}
      />
    </View>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}
