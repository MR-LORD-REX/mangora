import { Directory, Paths } from "expo-file-system";

import { deleteSafPath } from "@/services/downloader/native";
import { getFolderState } from "@/services/downloader/storage";

/** Removes only artifacts owned by the retired reader page cache. */
export async function removeLegacyReaderPageCache(): Promise<void> {
  const root = new Directory(Paths.cache, "reader-cache");
  try {
    if (root.exists) root.delete();
  } catch (error) {
    console.warn("[reader-cache-removal] app cache cleanup failed", error);
  }

  try {
    const folder = await getFolderState();
    if (!folder) return;
    const removed = await deleteSafPath(folder.treeUri, [
      "cache",
      "reader-cache",
    ]);
    if (removed) {
      console.log("[reader-cache-removal] removed legacy storage mirror");
    }
  } catch (error) {
    console.warn("[reader-cache-removal] storage mirror cleanup failed", error);
  }
}
