import { openMangaInfo } from "@composition/navigation/manga";
import { LibraryScreen } from "@features/library";

export default function LibraryRoute() {
  return <LibraryScreen onOpenManga={openMangaInfo} />;
}