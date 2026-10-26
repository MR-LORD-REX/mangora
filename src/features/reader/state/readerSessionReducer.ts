import type { ReaderChromeSettings } from "@core/settings/readerChrome";

export interface ReaderSessionState {
  currentPageIndex: number;
  chrome: ReaderChromeSettings;
  showHeader: boolean;
  loading: boolean;
}

export type ReaderChromeUpdate =
  | ReaderChromeSettings
  | ((current: ReaderChromeSettings) => ReaderChromeSettings);

export type ReaderSessionAction =
  | { type: "page/set"; pageIndex: number }
  | { type: "chrome/replace"; chrome: ReaderChromeUpdate }
  | { type: "chrome/patch"; patch: Partial<ReaderChromeSettings> }
  | { type: "chrome/visible/set"; visible: boolean }
  | { type: "chrome/toggle" }
  | { type: "loading/set"; loading: boolean };

export function createInitialReaderSessionState(
  chrome: ReaderChromeSettings,
): ReaderSessionState {
  return {
    currentPageIndex: 0,
    chrome: { ...chrome },
    showHeader: true,
    loading: true,
  };
}

export function readerSessionReducer(
  state: ReaderSessionState,
  action: ReaderSessionAction,
): ReaderSessionState {
  switch (action.type) {
    case "page/set": {
      const currentPageIndex = Math.max(0, Math.trunc(action.pageIndex));
      return currentPageIndex === state.currentPageIndex
        ? state
        : { ...state, currentPageIndex };
    }
    case "chrome/replace": {
      const chrome =
        typeof action.chrome === "function"
          ? action.chrome(state.chrome)
          : action.chrome;
      return chrome === state.chrome ? state : { ...state, chrome };
    }
    case "chrome/patch": {
      const chrome = { ...state.chrome, ...action.patch };
      return { ...state, chrome };
    }
    case "chrome/visible/set":
      return action.visible === state.showHeader
        ? state
        : { ...state, showHeader: action.visible };
    case "chrome/toggle":
      return { ...state, showHeader: !state.showHeader };
    case "loading/set":
      return action.loading === state.loading
        ? state
        : { ...state, loading: action.loading };
  }
}
