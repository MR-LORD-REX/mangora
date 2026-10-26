import { Check, Languages } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ChapterDownloadButton,
  type DownloadCandidate,
  type DownloadContext,
  type DownloadStatus,
} from "@features/downloads";
import type {
  ProgressMap,
  ViewerChapterRow,
} from "@shared/contracts";
import { colors } from "@shared/theme";
import { formatChapterDate } from "../../domain/chapterFormat";

export interface ChapterRowProps {
  row: ViewerChapterRow;
  accent: string;
  progress: ProgressMap;
  updatingRead: boolean;
  openChapter: (row: ViewerChapterRow) => void | Promise<void>;
  onLongPress: (row: ViewerChapterRow) => void;
  downloadByRowKey: Map<string, DownloadCandidate>;
  downloadStatuses: Record<string, DownloadStatus>;
  downloadContext: DownloadContext;
  onPretranslate: (candidate: DownloadCandidate) => void;
}

function statusText(row: ViewerChapterRow, progress: ProgressMap) {
  if (row.kind !== "chapter") return null;
  const item = progress[row.progressKey ?? ""];
  if (!item) return null;
  if (item.status === "completed") return { label: "Read", done: true as const };
  if (item.status === "reading") {
    return { label: `at page ${item.lastPageIndex + 1}`, done: false as const };
  }
  return null;
}

function rowDate(row: ViewerChapterRow) {
  return row.date != null ? formatChapterDate(row.date) : (row.dateLabel ?? null);
}

export default function ChapterRow({
  row,
  accent,
  progress,
  updatingRead,
  openChapter,
  onLongPress,
  downloadByRowKey,
  downloadStatuses,
  downloadContext,
  onPretranslate,
}: ChapterRowProps) {

    if (row.kind === "section") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{row.sectionLabel}</Text>
        </View>
      );
    }

    const status = statusText(row, progress);
    const completed = status?.done === true;
    const reading = Boolean(status && !status.done);
    const date = rowDate(row);
    const downloadCandidate = downloadByRowKey.get(row.key) ?? null;
    const downloadStatus = downloadCandidate
      ? downloadStatuses[downloadCandidate.target.chapterId]
      : undefined;

    return (
      <Pressable
        onPress={() => {
          if (updatingRead) return;
          void openChapter(row);
        }}
        onLongPress={() => onLongPress(row)}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.chapterRow,
          row.nested && styles.chapterRowNested,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.chapterTop}>
          <View style={styles.chapterNameWrap}>
            <Text
              numberOfLines={1}
              style={[
                styles.chapterName,
                row.nested && styles.chapterNameNested,
                (completed || reading) && styles.chapterNameRead,
              ]}
            >
              {row.title}
            </Text>
            {row.subtitle ? (
              <Text
                style={[
                  styles.groupName,
                  row.nested && { color: accent },
                ]}
              >
                {row.subtitle}
              </Text>
            ) : null}
            {date ? <Text style={styles.rowDate}>{date}</Text> : null}
          </View>
          <View style={styles.chapterRight}>
            {reading && status ? (
              <Text style={[styles.pageLabel, { color: accent }]}>
                {status.label}
              </Text>
            ) : completed ? (
              <View style={styles.readChip}>
                <Check color={colors.success} size={13} />
                <Text style={styles.readLabel}>Read</Text>
              </View>
            ) : null}
            {downloadCandidate ? (
              <View style={styles.chapterDownloadGroup}>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onPretranslate(downloadCandidate);
                  }}
                  hitSlop={8}
                  style={styles.pretranslateBtn}
                  accessibilityLabel="Pre-translate chapter"
                >
                  <Languages color={accent} size={18} />
                </Pressable>
                <ChapterDownloadButton
                  candidate={downloadCandidate}
                  context={downloadContext}
                  status={downloadStatus}
                  accent={accent}
                />
              </View>
            ) : null}
            {row.pageCount != null ? (
              <Text style={styles.pageCountLabel}>{row.pageCount} pages</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  
}

const styles = StyleSheet.create({
  chapterDownloadGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pretranslateBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pressed: { opacity: 0.7 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  sectionHeaderText: { color: colors.text, fontSize: 17, fontWeight: "800" },
  chapterRow: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 12,
    paddingVertical: 11,
    marginHorizontal: 16,
    marginBottom: 2,
  },
  chapterTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  chapterNameWrap: { flex: 1, gap: 2 },
  chapterName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chapterNameNested: { fontSize: 13.5 },
  chapterNameRead: { color: colors.textFaint, fontWeight: "500" },
  groupName: { color: colors.textFaint, fontSize: 12 },
  chapterRowNested: {
    marginLeft: 24,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  rowDate: { color: colors.textFaint, fontSize: 11.5, marginTop: 2 },
  chapterRight: { alignItems: "flex-end", gap: 3 },
  pageLabel: { fontSize: 12, fontWeight: "700" },
  readChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  readLabel: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  pageCountLabel: { color: colors.textFaint, fontSize: 11 },
});
