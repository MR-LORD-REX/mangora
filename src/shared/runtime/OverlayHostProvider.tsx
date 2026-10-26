import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface OverlayHostApi {
  present(id: string, overlay: ReactNode): void;
  dismiss(id: string): void;
}

const OverlayHostContext = createContext<OverlayHostApi | null>(null);

export function OverlayHostProvider({ children }: { children: ReactNode }) {
  const [overlays, setOverlays] = useState<Record<string, ReactNode>>({});

  const present = useCallback((id: string, overlay: ReactNode) => {
    setOverlays((current) =>
      current[id] === overlay ? current : { ...current, [id]: overlay },
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setOverlays((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ present, dismiss }), [present, dismiss]);

  return (
    <OverlayHostContext.Provider value={value}>
      {children}
      {Object.entries(overlays).map(([id, overlay]) => (
        <Fragment key={id}>{overlay}</Fragment>
      ))}
    </OverlayHostContext.Provider>
  );
}

export function useOverlayHost(): OverlayHostApi {
  const value = useContext(OverlayHostContext);
  if (!value) {
    throw new Error("useOverlayHost must be used within OverlayHostProvider.");
  }
  return value;
}

/** Registers one feature-owned overlay for the lifetime of a component. */
export function usePersistentOverlay(id: string, overlay: ReactNode): void {
  const { present, dismiss } = useOverlayHost();
  useEffect(() => {
    present(id, overlay);
    return () => dismiss(id);
  }, [dismiss, id, overlay, present]);
}
