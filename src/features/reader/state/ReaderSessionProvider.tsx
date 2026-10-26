import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import type { ReaderChromeSettings } from "@core/settings/readerChrome";

import {
  createInitialReaderSessionState,
  readerSessionReducer,
  type ReaderChromeUpdate,
  type ReaderSessionState,
} from "./readerSessionReducer";

export interface ReaderSessionValue extends ReaderSessionState {
  setChrome: (chrome: ReaderChromeUpdate) => void;
  patchChrome: (patch: Partial<ReaderChromeSettings>) => void;
  setCurrentPageIndex: (pageIndex: number) => void;
  setShowHeader: (showHeader: boolean) => void;
  setLoading: (loading: boolean) => void;
  toggleChrome: () => void;
}

const ReaderSessionContext = createContext<ReaderSessionValue | null>(null);

export function ReaderSessionProvider({
  initialChrome,
  children,
}: {
  initialChrome: ReaderChromeSettings;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    readerSessionReducer,
    initialChrome,
    createInitialReaderSessionState,
  );
  const setChrome = useCallback((chrome: ReaderChromeUpdate) => {
    dispatch({ type: "chrome/replace", chrome });
  }, []);
  const patchChrome = useCallback((patch: Partial<ReaderChromeSettings>) => {
    dispatch({ type: "chrome/patch", patch });
  }, []);
  const setCurrentPageIndex = useCallback((pageIndex: number) => {
    dispatch({ type: "page/set", pageIndex });
  }, []);
  const setShowHeader = useCallback((showHeader: boolean) => {
    dispatch({ type: "chrome/visible/set", visible: showHeader });
  }, []);
  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: "loading/set", loading });
  }, []);
  const toggleChrome = useCallback(() => {
    dispatch({ type: "chrome/toggle" });
  }, []);

  const value = useMemo<ReaderSessionValue>(
    () => ({
      ...state,
      setChrome,
      patchChrome,
      setCurrentPageIndex,
      setShowHeader,
      setLoading,
      toggleChrome,
    }),
    [
      state,
      setChrome,
      patchChrome,
      setCurrentPageIndex,
      setShowHeader,
      setLoading,
      toggleChrome,
    ],
  );

  return (
    <ReaderSessionContext.Provider value={value}>
      {children}
    </ReaderSessionContext.Provider>
  );
}

export function useReaderSession(): ReaderSessionValue {
  const session = useContext(ReaderSessionContext);
  if (!session) {
    throw new Error("useReaderSession must be used within ReaderSessionProvider.");
  }
  return session;
}
