/**
 * settings/translation-queue.tsx
 * ---------------------------------------------------------------------------
 * Pre-translate job queue with pause / cancel controls.
 * ---------------------------------------------------------------------------
 */

import React from "react";

import SettingsPage from "@/components/settings/SettingsPage";
import TranslationQueueSection from "@/components/settings/TranslationQueueSection";

export default function TranslationQueueSettingsScreen() {
  return (
    <SettingsPage
      title="Translation queue"
      subtitle="Chapters translating ahead of time"
    >
      <TranslationQueueSection standalone />
    </SettingsPage>
  );
}