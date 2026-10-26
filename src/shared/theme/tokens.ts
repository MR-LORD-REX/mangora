/**
 * Global design tokens shared by every feature.
 *
 * Feature-specific palettes (for example the reader chrome) stay inside their
 * feature. This module must not import any feature, screen or service.
 */

export const colors = {
  bg: "#0d1014",
  surface: "#151a21",
  surfaceHigh: "#1d232d",
  border: "#27303c",
  text: "#eef1f7",
  textMuted: "#a3abba",
  textFaint: "#687080",
  accent: "#8faeff",
  accentSoft: "#1d2740",
  onAccent: "#0a0d13",
  gold: "#ffd166",
  goldSoft: "#332b1a",
  danger: "#ff7b7b",
  dangerSoft: "#3a2024",
  success: "#4ade80",
  heart: "#ff5d8f",
  heartSoft: "#451d2e",
  scrim: "rgba(0,0,0,0.72)",
  loader: "#8faeff",
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  full: 999,
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
};

export type ViewMode = "grid" | "list";

export const viewModeLabels: Record<ViewMode, string> = {
  grid: "Grid view",
  list: "Compact list",
};
