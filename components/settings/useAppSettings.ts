/**
 * useAppSettings.ts
 * ---------------------------------------------------------------------------
 * Loads the settings store and keeps a screen in sync with it. Shared by the
 * Settings tab and every Settings sub-page so they all read the same source.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";

import {
  getSettings,
  subscribeSettings,
  updateSettings,
  type AppSettings,
} from "@/services/settings/settingsStore";

export function useAppSettings(): {
  settings: AppSettings | null;
  update: (patch: Partial<AppSettings>) => void;
} {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let active = true;
    void getSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    const unsubscribe = subscribeSettings(setSettings);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    void updateSettings(patch);
  }, []);

  return { settings, update };
}