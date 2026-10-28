import {
  Grid2X2,
  Grid3X3,
  List,
  type LucideIcon,
} from "lucide-react-native";

import type { SourceCardLayout } from "@core/settings";

export interface SourceCardLayoutOption {
  key: SourceCardLayout;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  columns: 1 | 2 | 4;
}

export const SOURCE_CARD_LAYOUT_OPTIONS: SourceCardLayoutOption[] = [
  {
    key: "grid2",
    label: "Grid, 2 columns",
    shortLabel: "2-column grid",
    icon: Grid2X2,
    columns: 2,
  },
  {
    key: "grid4",
    label: "Grid, 4 columns",
    shortLabel: "4-column grid",
    icon: Grid3X3,
    columns: 4,
  },
  {
    key: "list",
    label: "List",
    shortLabel: "Compact list",
    icon: List,
    columns: 1,
  },
];

export function sourceCardLayoutOption(
  layout: SourceCardLayout,
): SourceCardLayoutOption {
  return (
    SOURCE_CARD_LAYOUT_OPTIONS.find((option) => option.key === layout) ??
    SOURCE_CARD_LAYOUT_OPTIONS[0]
  );
}