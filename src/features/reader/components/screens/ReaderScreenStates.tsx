/**
 * Reader loading and empty-chapter states.
 *
 * These are full-screen route states, kept out of ReaderScreen so the main
 * composition stays focused on an available chapter.
 */
import { ArrowLeft } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface ReaderLoadingStateProps {
  backgroundColor?: string;
}

export function ReaderLoadingState({
  backgroundColor = "#000",
}: ReaderLoadingStateProps) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <View style={styles.centered}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    </SafeAreaView>
  );
}

export interface ReaderEmptyStateProps {
  message: string;
  onBack: () => void;
}

export function ReaderEmptyState({ message, onBack }: ReaderEmptyStateProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <Pressable onPress={onBack} style={styles.back}>
          <ArrowLeft color="white" size={28} />
        </Pressable>
        <Text style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { position: "absolute", top: 16, left: 16 },
  message: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});