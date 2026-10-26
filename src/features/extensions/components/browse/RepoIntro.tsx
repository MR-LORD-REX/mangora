import { ExternalLink, Link2, Plus } from "lucide-react-native";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { colors } from "@shared/theme";

import { browseStyles as styles } from "./BrowseStyles";

interface RepoIntroProps {
  onAdd: () => void;
}

/** First-run repository explanation and guide link. */
export default function RepoIntro({ onAdd }: RepoIntroProps) {
  return (
    <View style={styles.introCard}>
      <View style={styles.introIcon}>
        <Link2 color={colors.accent} size={26} />
      </View>
      <Text style={styles.introTitle}>Add a source repository</Text>
      <Text style={styles.introBody}>
        Mangora is a reader and translator. Paste the repository link of an
        extension provider you want to use; its extensions will appear in the
        Extensions tab after you install them.
      </Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Plus color={colors.onAccent} size={17} />
        <Text style={styles.primaryLabel}>Add repository</Text>
      </Pressable>
      <Pressable
        onPress={() => void Linking.openURL("https://t.me/MangoraApp/31")}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.primaryLabel}>Read the guide</Text>
        <ExternalLink size={15} color={colors.onAccent} />
      </Pressable>
      <Text style={styles.hintText}>
        Example: a GitHub index.json link. Nothing is preloaded.
      </Text>
    </View>
  );
}