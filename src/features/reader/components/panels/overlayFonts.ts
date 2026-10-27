/**
 * overlayFonts.ts
 * ---------------------------------------------------------------------------
 * Loads the optional overlay paste fonts and maps the persisted font key to a
 * React Native font family. Latin-script targets get the fancy fonts; other
 * scripts keep the system font so glyph coverage is never lost.
 * ---------------------------------------------------------------------------
 */

import { useFonts } from "expo-font";
import { Bangers_400Regular } from "@expo-google-fonts/bangers";
import { Chewy_400Regular } from "@expo-google-fonts/chewy";
import {
  ComicNeue_400Regular,
  ComicNeue_700Bold,
} from "@expo-google-fonts/comic-neue";

import type { ReaderOverlayFont } from "./readerChrome";

export const OVERLAY_FONT_OPTIONS: {
  key: ReaderOverlayFont;
  label: string;
}[] = [
  { key: "default", label: "Default" },
  { key: "comicNeue", label: "Comic Neue" },
  { key: "bangers", label: "Bangers" },
  { key: "chewy", label: "Chewy" },
];

/** Target languages written in Latin script (fonts above support these). */
const LATIN_TARGET_LANGUAGES = new Set([
  "af",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "en",
  "es",
  "et",
  "eu",
  "fi",
  "fr",
  "gl",
  "hr",
  "hu",
  "id",
  "is",
  "it",
  "la",
  "lt",
  "lv",
  "ms",
  "mt",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "sk",
  "sl",
  "sq",
  "sv",
  "sw",
  "tl",
  "tr",
  "vi",
]);

export function overlayFontSupportsLanguage(language: string): boolean {
  const base = (language || "en").toLowerCase().split("-")[0];
  return LATIN_TARGET_LANGUAGES.has(base);
}

export function useOverlayFonts(): boolean {
  const [loaded] = useFonts({
    ComicNeue_400Regular,
    ComicNeue_700Bold,
    Bangers_400Regular,
    Chewy_400Regular,
  });
  return loaded;
}

export function overlayFontFamily(
  font: ReaderOverlayFont,
  loaded: boolean,
  weight = 400,
): string | undefined {
  if (!loaded || font === "default") return undefined;
  switch (font) {
    case "comicNeue":
      return weight >= 700 ? "ComicNeue_700Bold" : "ComicNeue_400Regular";
    case "bangers":
      return "Bangers_400Regular";
    case "chewy":
      return "Chewy_400Regular";
    default:
      return undefined;
  }
}

/** Bold text is wider; give the fitter a slightly narrower usable box. */
export function overlayWeightWidthFactor(weight: number): number {
  if (weight >= 800) return 0.9;
  if (weight >= 700) return 0.94;
  if (weight >= 600) return 0.97;
  return 1;
}

/** Corrects the fitter's generic Latin width model per display font. */
export function overlayFontFitWidthFactor(font: ReaderOverlayFont): number {
  if (font === "bangers") return 1.18;
  if (font === "chewy") return 0.9;
  return 1;
}

/** Display fonts have different intrinsic line heights. */
export function overlayFontLineHeight(font: ReaderOverlayFont): number {
  if (font === "bangers") return 1.05;
  if (font === "chewy") return 1.18;
  return 1.2;
}
