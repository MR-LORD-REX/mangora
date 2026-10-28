/** Navigation callbacks supplied by the Expo Router adapter. */
export interface DownloadManagerScreenProps {
  onBack: () => void;
  providerLabel: (provider: string) => string;
  onOpenDownloadedManga: (target: {
    provider: string;
    id: string;
    thumbnailUrl: string | null;
  }) => void;
  onManageDownloadedManga: (mangaId: string) => void;
}
