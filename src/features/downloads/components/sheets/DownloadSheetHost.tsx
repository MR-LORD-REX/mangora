import React, { useMemo } from "react";

import { usePersistentOverlay } from "@shared/runtime";

import DownloadSheetContent from "./DownloadSheetContent";

/** Registers the downloader sheet with the shared root overlay host. */
export default function DownloadSheetHost() {
  const overlay = useMemo(() => <DownloadSheetContent />, []);
  usePersistentOverlay("downloads", overlay);
  return null;
}
