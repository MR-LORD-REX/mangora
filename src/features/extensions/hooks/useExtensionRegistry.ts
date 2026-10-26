import { useSyncExternalStore } from "react";

import {
  getExtensionRegistrySnapshot,
  subscribeExtensionRegistry,
} from "../registry/registry";

/** Live installed-extension snapshot for browse, library and settings. */
export function useExtensionRegistry() {
  return useSyncExternalStore(
    subscribeExtensionRegistry,
    getExtensionRegistrySnapshot,
    getExtensionRegistrySnapshot,
  );
}