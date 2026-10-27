/**
 * React adapter for the reader translation pipeline.
 *
 * The controller owns queue lifecycle and RAM state. This hook keeps only the
 * current snapshot in React, mirrors page/config changes into the controller,
 * and disposes the controller on reader unmount.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { PageTranslationState } from "@features/translation";

import {
  ReaderTranslationPipeline,
  type ReaderTranslationPipelineOptions,
} from "./readerTranslationPipeline";
import {
  EMPTY_READER_PIPELINE_METRICS,
  type PipelineConfig,
  type ReaderTranslationController,
  type ReaderTranslationSnapshot,
  type UseReaderTranslationOptions,
} from "./types";

const EMPTY_SNAPSHOT: ReaderTranslationSnapshot = {
  translationPages: {},
  pipelineError: null,
  autoTranslation: false,
  translationActive: false,
  singlePageBusy: false,
  singlePageIndex: null,
  activeTranslationJobs: 0,
  metrics: EMPTY_READER_PIPELINE_METRICS,
};

function pipelineConfig(options: UseReaderTranslationOptions): PipelineConfig {
  return {
    engine: options.translationEngine,
    translationMode: options.translationMode,
    sourceLanguage: options.ocrLanguage,
    targetLanguage: options.targetLanguage || "en",
    geminiApiKey: options.geminiApiKey,
    geminiModelId: options.geminiModelId,
    aiMaxContextPages: options.aiMaxContextPages,
    autoModelSwitch: options.autoModelSwitch,
  };
}

export function useReaderTranslation(
  options: UseReaderTranslationOptions,
): ReaderTranslationController {
  const {
    source,
    providerLanguage,
    readerLanguageOverride,
    pages,
    currentPageIndex,
    identity,
    ocrBubbleWorkers,
    ocrLookahead,
    onAutoModelSwitchDisabled,
    onTranslationSetupRequired,
  } = options;
  const [snapshot, setSnapshot] =
    useState<ReaderTranslationSnapshot>(EMPTY_SNAPSHOT);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const callbacksRef = useRef({
    onAutoModelSwitchDisabled,
    onTranslationSetupRequired,
  });
  callbacksRef.current = {
    onAutoModelSwitchDisabled,
    onTranslationSetupRequired,
  };

  const pipelineOptions: Omit<
    ReaderTranslationPipelineOptions,
    "onSnapshot" | "onAutoModelSwitchDisabled" | "onTranslationSetupRequired"
  > = {
    source,
    identity,
    config: pipelineConfig(options),
    pages,
    currentPageIndex,
    ocrBubbleWorkers,
    ocrLookahead,
  };
  const pipelineRef = useRef<ReaderTranslationPipeline | null>(null);
  const initialOptionsRef = useRef(pipelineOptions);
  if (!pipelineRef.current) {
    const initial = initialOptionsRef.current;
    pipelineRef.current = new ReaderTranslationPipeline({
      ...initial,
      onSnapshot: (next) => {
        snapshotRef.current = next;
        setSnapshot(next);
      },
      onAutoModelSwitchDisabled: () =>
        callbacksRef.current.onAutoModelSwitchDisabled(),
      onTranslationSetupRequired: () =>
        callbacksRef.current.onTranslationSetupRequired(),
    });
  }
  const pipeline = pipelineRef.current;

  useEffect(() => {
    return () => pipeline.dispose();
  }, [pipeline]);

  useEffect(() => {
    pipeline.updateConfig(pipelineConfig(options));
    // Config fields are listed explicitly so unrelated reader settings do not
    // restart or republish the pipeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pipeline,
    options.translationEngine,
    options.translationMode,
    options.ocrLanguage,
    options.targetLanguage,
    options.geminiApiKey,
    options.geminiModelId,
    options.aiMaxContextPages,
    options.autoModelSwitch,
  ]);

  useEffect(() => {
    pipeline.setPages(pages);
  }, [pipeline, pages]);

  useEffect(() => {
    pipeline.setOcrLookahead(ocrLookahead);
  }, [pipeline, ocrLookahead]);

  useEffect(() => {
    pipeline.setCurrentPageIndex(currentPageIndex);
  }, [pipeline, currentPageIndex]);

  useEffect(() => {
    if (!snapshot.autoTranslation) return;
    pipeline.scheduleAutoWindow();
  }, [pipeline, snapshot.autoTranslation, currentPageIndex, pages, ocrLookahead]);

  useEffect(() => {
    return () => {
      console.log("[reader][tr] pipeline scope closed", {
        source,
        chapterLanguage: providerLanguage,
        override: readerLanguageOverride || "auto",
      });
    };
    // Diagnostics only; the controller itself disposes on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = useMemo(
    () => ({
      setPipelineError: (message: string | null) =>
        pipeline.setPipelineError(message),
      resetTranslationPipeline: () => pipeline.resetTranslationPipeline(),
      stopTranslationRun: () => pipeline.stopTranslationRun(),
      toggleAutoTranslation: () => pipeline.toggleAutoTranslation(),
      translateSinglePage: (url: string) =>
        pipeline.translateSinglePage(url),
      retryPage: (url: string) => pipeline.retryPage(url),
      clearRamCache: () => pipeline.clearRamCache(),
    }),
    [pipeline],
  );

  return useMemo<ReaderTranslationController>(
    () => ({ ...snapshot, ...actions }),
    [actions, snapshot],
  );
}

export type {
  ReaderPipelineMetrics,
  ReaderTranslationController,
  UseReaderTranslationOptions,
} from "./types";
export type { PageTranslationState };
