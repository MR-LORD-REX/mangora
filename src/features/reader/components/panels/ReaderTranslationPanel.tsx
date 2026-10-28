/**
 * ReaderTranslationPanel.tsx
 * ---------------------------------------------------------------------------
 * Translation options sheet opened from the reader header's sliders icon.
 * The sheet shell lives here; each tab and its private helpers live under
 * ./translation.
 * ---------------------------------------------------------------------------
 */

import { X } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { TabBar, TabContentTransition } from "./ReaderPanelPrimitives";
import AdvanceTab from "./translation/AdvanceTab";
import LanguageTab from "./translation/LanguageTab";
import MetricsTab from "./translation/MetricsTab";
import ModeTab from "./translation/ModeTab";
import OverlayTab from "./translation/OverlayTab";
import { styles } from "./translation/styles";
import {
  READER_TRANSLATION_TABS,
  type ReaderTranslationPanelProps,
  type ReaderTranslationTab,
} from "./translation/types";

export type { ReaderTranslationPanelProps, ReaderTranslationTab };
export { READER_TRANSLATION_TABS };

export default function ReaderTranslationPanel(
  props: ReaderTranslationPanelProps,
) {
  const { tab, onTabChange, onClose } = props;
  const activeIndex = READER_TRANSLATION_TABS.findIndex(
    (item) => item.key === tab,
  );
  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <TabBar
          tabs={READER_TRANSLATION_TABS}
          active={tab}
          onChange={onTabChange}
        />
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <TabContentTransition activeIndex={activeIndex}>
          {tab === "language" && <LanguageTab {...props} />}
          {tab === "trMode" && <ModeTab {...props} />}
          {tab === "advance" && <AdvanceTab {...props} />}
          {tab === "metrics" && <MetricsTab {...props} />}
          {tab === "overlay" && <OverlayTab {...props} />}
        </TabContentTransition>
      </ScrollView>
    </View>
  );
}
