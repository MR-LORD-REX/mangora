/** Navigation operation supplied by the route/composition layer. */
export type OpenMangaInfo = (target: {
  provider: string;
  id: string;
  thumbnailUrl?: string | null;
}) => void;