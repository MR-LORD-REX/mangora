import type { ReaderChromeSettings } from "../readerChrome";

export type ReaderConfigTab = "reading" | "general" | "filter";

export interface ReaderConfigPanelProps {
  tab: ReaderConfigTab;
  onTabChange: (tab: ReaderConfigTab) => void;
  onClose: () => void;
  chrome: ReaderChromeSettings;
  onChangeChrome: (patch: Partial<ReaderChromeSettings>) => void;
  defaultZoomScale: number;
  onChangeDefaultZoomScale: (scale: number) => void;
  scrollSpeed: number;
  onSelectScrollSpeed: (speed: number) => void;
}

export interface ReaderConfigTabProps {
  chrome: ReaderChromeSettings;
  onChangeChrome: (patch: Partial<ReaderChromeSettings>) => void;
  defaultZoomScale: number;
  onChangeDefaultZoomScale: (scale: number) => void;
  scrollSpeed: number;
  onSelectScrollSpeed: (speed: number) => void;
}
