/**
 * settings/translation-queue.tsx
 * ---------------------------------------------------------------------------
 * Pre-translate job queue with pause / cancel controls.
 * ---------------------------------------------------------------------------
 */

import React from "react";

import SettingsPage from "../components/layout/SettingsPage";
import TranslationQueueSection from "../components/sections/translation/TranslationQueueSection";

export function TranslationQueueSettingsScreen() {
  return (
    <SettingsPage
      title="Translation queue"
      subtitle="Chapters translating ahead of time"
    >
      <TranslationQueueSection standalone />
    </SettingsPage>
  );
}