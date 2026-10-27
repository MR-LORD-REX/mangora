import { X } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { isPagedMode } from "./readerChrome";
import { TabBar } from "./ReaderPanelPrimitives";
import { READER_PANEL_BG, READER_PILL_BORDER } from "./readerTheme";
import FilterTab from "./config/FilterTab";
import GeneralTab from "./config/GeneralTab";
import ReadingTab from "./config/ReadingTab";
import type {
  ReaderConfigPanelProps,
  ReaderConfigTab,
} from "./config/types";

export type { ReaderConfigPanelProps, ReaderConfigTab };

export const READER_CONFIG_TABS: { key: ReaderConfigTab; label: string }[] = [
  { key: "reading", label: "Reading" },
  { key: "general", label: "General" },
  { key: "filter", label: "Filter" },
];

export default function ReaderConfigPanel(props: ReaderConfigPanelProps) {
  const { tab, onTabChange, onClose, chrome } = props;
  const paged = isPagedMode(chrome.readingMode);

  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <TabBar tabs={READER_CONFIG_TABS} active={tab} onChange={onTabChange} />
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === "reading" && <ReadingTab {...props} />}
        {tab === "general" && <GeneralTab {...props} />}
        {tab === "filter" && <FilterTab {...props} />}
        <Text style={styles.footerNote}>
          {paged && tab === "reading"
            ? "Auto-scroll is only available in Scroll reading modes."
            : ""}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
    backgroundColor: READER_PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 60,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3a3c4d",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: READER_PILL_BORDER,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  bodyContent: { paddingBottom: 40 },
  footerNote: { color: "#9ca3af", fontSize: 12, marginTop: 12 },
});
