import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  getSettings,
  getSettingsSnapshot,
  subscribeSettings,
  updateSettings,
  type AppSettings,
} from "@core/settings";

export function useAppSettings(): {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
} {
  useEffect(() => {
    void getSettings();
  }, []);

  const settings = useSyncExternalStore(
    (listener) => subscribeSettings(() => listener()),
    getSettingsSnapshot,
    getSettingsSnapshot,
  );

  const update = useCallback((patch: Partial<AppSettings>) => {
    void updateSettings(patch);
  }, []);

  return { settings, update };
}
