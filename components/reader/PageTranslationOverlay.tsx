/**
 * PageTranslationOverlay.tsx
 * ---------------------------------------------------------------------------
 * Draws the translation result over one reader page:
 *   1. White strips erase the original text (clean_text boxes inside bubbles,
 *      the full messy box for free text).
 *   2. The translated text is pasted on top - centred inside ~90% of the
 *      bubble box for speech bubbles, or the full messy box for free text.
 *
 * All geometry arrives in natural page pixels and is mapped to display px
 * with the same sx/sy scale used by the page image itself.
 * ---------------------------------------------------------------------------
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type {
  Box,
  PageTranslationState,
  TranslationRegionState,
} from "@/services/translation/translation.types";

import { fitTextFontSize } from "./textFit";

/** Bubble text is inset to ~90% of the detected bubble box. */
const BUBBLE_INSET_RATIO = 0.05;

function toDisplay(box: Box, sx: number, sy: number) {
  return {
    left: box.x1 * sx,
    top: box.y1 * sy,
    width: Math.max(2, (box.x2 - box.x1) * sx),
    height: Math.max(2, (box.y2 - box.y1) * sy),
  };
}

interface PageTranslationOverlayProps {
  translation: PageTranslationState;
  displayWidth: number;
  displayHeight: number;
  textScale: number;
}

export default function PageTranslationOverlay({
  translation,
  displayWidth,
  displayHeight,
  textScale,
}: PageTranslationOverlayProps) {
  const imageWidth = translation.imageWidth || 1;
  const imageHeight = translation.imageHeight || 1;
  const sx = displayWidth / imageWidth;
  const sy = displayHeight / imageHeight;

  const strips: { key: string; box: Box }[] = [];
  const texts: { key: string; region: TranslationRegionState }[] = [];
  for (const region of translation.regions) {
    if (
      region.status === "processing" ||
      region.status === "done"
    ) {
      region.eraseBoxes.forEach((box, index) => {
        strips.push({ key: `${region.id}-erase-${index}`, box });
      });
    }
    if (region.status === "done" && region.translatedText) {
      texts.push({ key: `${region.id}-text`, region });
    }
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {strips.map(({ key, box }) => {
        const display = toDisplay(box, sx, sy);
        return (
          <View
            key={key}
            style={[styles.eraseStrip, { ...display }]}
          />
        );
      })}
      {texts.map(({ key, region }) => {
        const paste = toDisplay(region.pasteBox, sx, sy);
        const inset =
          region.kind === "bubble" ? BUBBLE_INSET_RATIO : 0;
        const contentLeft = paste.left + paste.width * inset;
        const contentTop = paste.top + paste.height * inset;
        const contentWidth = Math.max(2, paste.width * (1 - inset * 2));
        const contentHeight = Math.max(2, paste.height * (1 - inset * 2));
        const fitted = fitTextFontSize({
          text: region.translatedText ?? "",
          width: contentWidth,
          height: contentHeight,
        });
        const fontSize = Math.max(6, fitted * textScale);
        return (
          <View
            key={key}
            style={{
              position: "absolute",
              left: contentLeft,
              top: contentTop,
              width: contentWidth,
              height: contentHeight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              allowFontScaling={false}
              style={{
                color: "#0f172a",
                fontSize,
                lineHeight: Math.round(fontSize * 1.2),
                textAlign: "center",
                fontWeight: "600",
                includeFontPadding: false,
              }}
            >
              {region.translatedText}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  eraseStrip: {
    position: "absolute",
    backgroundColor: "#ffffff",
  },
});
