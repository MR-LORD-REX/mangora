/**
 * settings/queue.tsx
 * ---------------------------------------------------------------------------
 * Live download queue with retry-failed and cancel-pending controls.
 * ---------------------------------------------------------------------------
 */

import React from "react";

import QueueSection from "@/components/settings/QueueSection";
import SettingsPage from "@/components/settings/SettingsPage";

export default function QueueSettingsScreen() {
  return (
    <SettingsPage
      title="Download queue"
      subtitle="Live progress of the chapter queue"
    >
      <QueueSection standalone />
    </SettingsPage>
  );
}