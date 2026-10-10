import {
    MIN_CROP_PX,
    cropRegionToLocalFile,
    deleteCropFile,
    downloadPageToCache,
    emptyPageOutput,
    makePageItem,
    prepareTextRegions,
    type OcrCrop,
    type OcrTextItem,
    type PageOcrOptions,
    type PageOcrOutput,
} from "./pageOcr";
import { TrappOcrClient } from "./trappOcrClient";

export interface TrappOcrPageOptions extends PageOcrOptions {
  language: string;
  script?: string;
}

const MAX_CROP_DIMENSION = 1400;

function responseToItems(
  crop: OcrCrop,
  classId: number,
  text: string,
  boxes: {
    text: string;
    confidence: number | null;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[]
): OcrTextItem[] {
  const mapped = boxes
    .filter((box) => box.text.trim())
    .map((box) =>
      makePageItem({
        text: box.text.trim(),
        confidence: box.confidence ?? 1,
        level: "word",
        classId,
        x1: box.x1,
        y1: box.y1,
        x2: box.x2,
        y2: box.y2,
        crop,
      })
    );
  if (mapped.length > 0) return mapped;

  const fallback = text.trim();
  return fallback
    ? [
        makePageItem({
          text: fallback,
          confidence: 1,
          level: "line",
          classId,
          x1: 0,
          y1: 0,
          x2: crop.width,
          y2: crop.height,
          crop,
        }),
      ]
    : [];
}

export async function recognizePageRegionsWithTrappOcr(
  options: TrappOcrPageOptions
): Promise<PageOcrOutput> {
  const { pageUrl, headers, imageWidth, imageHeight, language, script, maxCrops = 24 } = options;
  const textRegions = prepareTextRegions(options.regions, maxCrops);
  const empty = emptyPageOutput({
    pageUrl,
    imageWidth,
    imageHeight,
    skipped: textRegions.length,
  });
  if (textRegions.length === 0) return empty;

  const client = new TrappOcrClient();
  const localPageUri = await downloadPageToCache(pageUrl, headers);
  let cropsFailed = 0;
  let cropsSkipped = 0;
  let cropsRecognized = 0;
  const items: OcrTextItem[] = [];

  for (const region of textRegions) {
    const regionWidth = region.x2 - region.x1;
    const regionHeight = region.y2 - region.y1;
    if (regionWidth < MIN_CROP_PX || regionHeight < MIN_CROP_PX) {
      cropsSkipped += 1;
      continue;
    }

    let crop: OcrCrop | null = null;
    try {
      crop = await cropRegionToLocalFile(localPageUri, region, imageWidth, imageHeight, {
        maxDimension: MAX_CROP_DIMENSION,
      });
      const response = await client.recognizeFile(
        { uri: crop.uri, name: "crop.jpg", type: "image/jpeg" },
        language,
        script,
      );
      const result = response.results[0];
      if (!result) {
        cropsFailed += 1;
        continue;
      }
      const mapped = responseToItems(crop, region.classId, result.text, result.boxes);
      items.push(...mapped);
      if (mapped.length > 0) cropsRecognized += 1;
    } catch (error) {
      cropsFailed += 1;
      console.warn("Mangora OCR crop failed:", { region, error });
    } finally {
      if (crop) await deleteCropFile(crop.uri);
    }
  }

  return {
    pageUrl,
    imageWidth,
    imageHeight,
    items,
    cropsRecognized,
    cropsFailed,
    cropsSkipped,
  };
}
