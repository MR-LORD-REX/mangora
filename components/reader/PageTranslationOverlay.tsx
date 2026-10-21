/**
 * PageTranslationOverlay.tsx
 * ---------------------------------------------------------------------------
 * Draws the translation result over one reader page.
 *
 * Bubble regions produced by the Manga109 segmenter carry a page-space mask:
 *   1. The mask interior (trimmed to preserve the inked outline) is filled
 *      white with an SVG path, erasing the source text inside the bubble.
 *   2. Translated text is laid out line by line against the mask's width at
 *      each line height, so it follows curved and tapered bubbles instead of
 *      overflowing a rectangle.
 *
 * Legacy YOLO / cache regions without a mask keep the previous rectangle
 * erase + rectangular fit behaviour. All geometry arrives in natural page
 * pixels and is mapped to display pixels with the page's sx/sy scale.
 * ---------------------------------------------------------------------------
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import type {
  Box,
  PageTranslationState,
  Point,
  TranslationRegionState,
} from "@/services/translation/translation.types";

import {
  insetMaskPolygon,
  layoutTextInMask,
  polygonBounds,
  polygonToPath,
  type MaskTextLayout,
} from "./maskTextLayout";
import type { ReaderOverlayFont } from "./readerChrome";
import {
  overlayFontFamily,
  overlayFontFitWidthFactor,
  overlayFontLineHeight,
  overlayWeightWidthFactor,
  useOverlayFonts,
} from "./overlayFonts";
import { fitTextFontSize } from "./textFit";

/** Usable paste area = 75% of the detected bubble area (legacy rectangles). */
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
 * Duplicate detections and duplicate cached regions both land here.
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

function scalePolygon(polygon: Point[], sx: number, sy: number): Point[] {
  return polygon.map((point) => ({ x: point.x * sx, y: point.y * sy }));
}

function canErase(region: TranslationRegionState): boolean {
  return (
    region.status === "processing" ||
    (region.status === "done" && !!region.translatedText?.trim())
  );
}

interface MaskRender {
  region: TranslationRegionState;
  erasePath: string;
  layout: MaskTextLayout | null;
}

interface PreparedOverlay {
  legacyStrips: { key: string; box: Box }[];
  legacyTexts: TranslationRegionState[];
  maskRenders: MaskRender[];
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
  const widthScale =
    overlayWeightWidthFactor(weight) * overlayFontFitWidthFactor(overlayFont);
  const imageWidth = translation.imageWidth || 1;
  const imageHeight = translation.imageHeight || 1;
  const sx = displayWidth / imageWidth;
  const sy = displayHeight / imageHeight;
  const fontScale = Math.min(1.5, Math.max(0.5, overlayFontScale || 1));

  const prepared = useMemo<PreparedOverlay>(() => {
    const legacyStrips: { key: string; box: Box }[] = [];
    const maskRegions: TranslationRegionState[] = [];
    const allMaskRegions = translation.regions.filter(
      (region) => region.mask && region.mask.polygon.length >= 3,
    );

    for (const region of translation.regions) {
      if (!canErase(region)) continue;
      if (region.mask && region.mask.polygon.length >= 3) {
        maskRegions.push(region);
      } else {
        region.eraseBoxes.forEach((box, index) => {
          legacyStrips.push({ key: `${region.id}-erase-${index}`, box });
        });
      }
    }

    const placed: TranslationRegionState[] = [];
    const visibleIds = new Set<number>();
    for (const region of translation.regions) {
      if (region.status !== "done" || !region.translatedText) continue;
      if (isDuplicatePaste(region, placed)) continue;
      placed.push(region);
      visibleIds.add(region.id);
    }

    const legacyTexts = translation.regions.filter(
      (region) =>
        visibleIds.has(region.id) && !(region.mask && region.mask.polygon.length >= 3),
    );

    // Scanlations keep one font size across a page. A median of each bubble's
    // short side tracks the artwork scale while staying stable for oversized
    // bubbles. The user's overlay scale remains an explicit multiplier.
    const bubbleShortSides = allMaskRegions
      .map((region) => {
        const bounds = polygonBounds(scalePolygon(region.mask!.polygon, sx, sy));
        return Math.min(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
      })
      .filter((size) => size > 1)
      .sort((a, b) => a - b);
    const medianShortSide =
      bubbleShortSides.length > 0
        ? bubbleShortSides[Math.floor(bubbleShortSides.length / 2)]
        : 0;
    const pageFont = Math.max(
      5,
      Math.min(28, medianShortSide * 0.135 * fontScale),
    );

    const maskRenders = maskRegions.map((region) => {
      const polygon = scalePolygon(region.mask!.polygon, sx, sy);
      const bounds = polygonBounds(polygon);
      const pad = Math.max(
        1.5,
        Math.min(
          10,
          Math.min(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1) * 0.045,
        ),
      );
      const erasePolygon = insetMaskPolygon(polygon, pad, pad, pad, 64);
      const layout =
        visibleIds.has(region.id) && region.translatedText
          ? layoutTextInMask({
              text: region.translatedText,
              polygon,
              lineHeightMultiplier,
              widthScale,
              maxFont: 160 * fontScale,
              minFont: 5,
              preferredLineCount: region.lineCount,
              preferredFont: pageFont,
              padRatio: 0.08,
              fillRatio: 0.86,
            })
          : null;
      return {
        region,
        erasePath: polygonToPath(erasePolygon),
        layout,
      };
    });

    return { legacyStrips, legacyTexts, maskRenders };
  }, [
    translation.regions,
    sx,
    sy,
    lineHeightMultiplier,
    widthScale,
    fontScale,
  ]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {prepared.maskRenders.length > 0 ? (
        <Svg
          pointerEvents="none"
          width={displayWidth}
          height={displayHeight}
          style={StyleSheet.absoluteFill}
        >
          {prepared.maskRenders.map(({ region, erasePath }) =>
            erasePath ? (
              <Path
                key={`${region.id}-mask-erase`}
                d={erasePath}
                fill="#ffffff"
              />
            ) : null,
          )}
        </Svg>
      ) : null}

      {prepared.legacyStrips.map(({ key, box }) => {
        const display = toDisplay(box, sx, sy);
        return <View key={key} style={[styles.eraseStrip, display]} />;
      })}

      {prepared.legacyTexts.map((region) => {
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
          width: contentWidth * widthScale,
          height: contentHeight,
          lineHeightMultiplier,
          maxFont: Math.max(24, Math.min(160, contentHeight)),
        });
        const fontSize = Math.max(6, fitted * fontScale);
        return (
          <View
            key={`${region.id}-text`}
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

      {prepared.maskRenders.map(({ region, layout }) => {
        if (!layout) return null;
        return layout.lines.map((line, index) => (
          <Text
            key={`${region.id}-line-${index}`}
            allowFontScaling={false}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            ellipsizeMode="clip"
            style={{
              position: "absolute",
              left: line.left,
              top: line.top,
              width: line.width,
              color: overlayTextColor,
              fontSize: layout.fontSize,
              lineHeight: layout.lineHeight,
              textAlign: "center",
              fontFamily,
              fontWeight,
              includeFontPadding: false,
            }}
          >
            {line.text}
          </Text>
        ));
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
