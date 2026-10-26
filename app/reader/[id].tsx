import { router, useLocalSearchParams } from "expo-router";

import { openMangaInfo } from "@composition/navigation/manga";
import {
  ReaderScreen,
  ReaderSessionProvider,
} from "@features/reader";
import { DEFAULT_READER_CHROME } from "@core/settings/readerChrome";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function ReaderRoute() {
  const params = useLocalSearchParams<{
    id: string | string[];
    source: string;
    mangaId?: string | string[];
    title?: string | string[];
    mangaTitle?: string | string[];
    chapterTitle?: string | string[];
    chapterMemo?: string | string[];
    thumbnailUrl?: string | string[];
    language?: string;
  }>();

  const source = paramString(params.source);
  const chapterId = paramString(params.id);
  const mangaId = paramString(params.mangaId);
  const chapterTitle = paramString(params.chapterTitle);
  const title = chapterTitle || paramString(params.title) || chapterId;
  const mangaTitle = paramString(params.mangaTitle) || title;

  return (
    <ReaderSessionProvider initialChrome={DEFAULT_READER_CHROME}>
      <ReaderScreen
        source={source}
        chapterId={chapterId}
        mangaId={mangaId}
        title={title}
        mangaTitle={mangaTitle}
        thumbnailUrl={paramString(params.thumbnailUrl)}
        language={paramString(params.language)}
        chapterMemo={paramString(params.chapterMemo)}
        chapterTitle={chapterTitle}
        onOpenMangaInfo={openMangaInfo}
        onBack={() => router.back()}
        onReplaceReader={(nextParams) =>
          router.replace({ pathname: "/reader/[id]", params: nextParams })
        }
      />
    </ReaderSessionProvider>
  );
}
