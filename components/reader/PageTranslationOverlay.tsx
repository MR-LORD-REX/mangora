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
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type {
  Box,
  PageTranslationState,
  TranslationRegionState,
} from "@/services/translation/translation.types";

import type { ReaderOverlayFont } from "./readerChrome";
import {
  overlayFontFamily,
  overlayFontFitWidthFactor,
  overlayFontLineHeight,
  overlayWeightWidthFactor,
  useOverlayFonts,
} from "./overlayFonts";
import { fitTextFontSize } from "./textFit";

/** Usable paste area = 85% of the detected bubble area. */
const BUBBLE_CONTENT_AREA_RATIO = 0.75;
const BUBBLE_LINEAR_SCALE = Math.sqrt(BUBBLE_CONTENT_AREA_RATIO);
/** Tiny detections still get a readable minimum box. */
const MIN_CONTENT_SIDE = 18;

function boxArea(box: Box): number {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

function overlapOfSmaller(a: Box, b: Box): number {
  const smallest = Math.min(boxArea(a), boxArea(b));
  if (smallest <= 0) return 0;
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / smallest;
}

function normalizedText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/**
 * Drops a region when another region already pasted text into the same spot.
 * Duplicate YOLO boxes and duplicate cached regions both land here.
 */
function isDuplicatePaste(
  candidate: TranslationRegionState,
  placed: TranslationRegionState[],
): boolean {
  const candidateText = normalizedText(candidate.translatedText ?? "");
  return placed.some((region) => {
    const overlap = overlapOfSmaller(candidate.pasteBox, region.pasteBox);
    if (overlap >= 0.85) return true;
    if (overlap < 0.55) return false;
    const otherText = normalizedText(region.translatedText ?? "");
    return (
      candidateText.length > 0 &&
      otherText.length > 0 &&
      (candidateText === otherText ||
        candidateText.includes(otherText) ||
        otherText.includes(candidateText))
    );
  });
}

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
  overlayFont: ReaderOverlayFont;
  overlayFontWeight: number;
  /** User scaler applied on top of the auto-fit size (0.5-1.5). */
  overlayFontScale: number;
  overlayTextColor: string;
}

export default function PageTranslationOverlay({
  translation,
  displayWidth,
  displayHeight,
  overlayFont,
  overlayFontWeight,
  overlayFontScale,
  overlayTextColor,
}: PageTranslationOverlayProps) {
  const fontsLoaded = useOverlayFonts();
  const weight = Math.min(900, Math.max(400, Math.round(overlayFontWeight / 100) * 100));
  const fontFamily = overlayFontFamily(overlayFont, fontsLoaded, weight);
  const fontWeight = String(weight) as TextStyle["fontWeight"];
  const lineHeightMultiplier = overlayFontLineHeight(overlayFont);
  const imageWidth = translation.imageWidth || 1;
  const imageHeight = translation.imageHeight || 1;
  const sx = displayWidth / imageWidth;
  const sy = displayHeight / imageHeight;

  const strips: { key: string; box: Box }[] = [];
  const texts: { key: string; region: TranslationRegionState }[] = [];
  const placedTexts: TranslationRegionState[] = [];
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
      if (isDuplicatePaste(region, placedTexts)) continue;
      placedTexts.push(region);
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
        const isBubble = region.kind === "bubble";
        const contentWidth = Math.max(
          isBubble ? MIN_CONTENT_SIDE : 2,
          paste.width * (isBubble ? BUBBLE_LINEAR_SCALE : 1),
        );
        const contentHeight = Math.max(
          isBubble ? MIN_CONTENT_SIDE : 2,
          paste.height * (isBubble ? BUBBLE_LINEAR_SCALE : 1),
        );
        const contentLeft = paste.left + (paste.width - contentWidth) / 2;
        const contentTop = paste.top + (paste.height - contentHeight) / 2;
        const fitted = fitTextFontSize({
          text: region.translatedText ?? "",
          width:
            contentWidth *
            overlayWeightWidthFactor(weight) *
            overlayFontFitWidthFactor(overlayFont),
          height: contentHeight,
          lineHeightMultiplier,
          maxFont: Math.max(24, Math.min(160, contentHeight)),
        });
        const scale = Math.min(1.5, Math.max(0.5, overlayFontScale || 1));
        const fontSize = Math.max(6, fitted * scale);
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
                color: overlayTextColor,
                fontSize,
                lineHeight: Math.round(fontSize * lineHeightMultiplier),
                textAlign: "center",
                fontFamily,
                fontWeight,
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
