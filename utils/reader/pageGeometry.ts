/**
 * pageGeometry.ts
 * ---------------------------------------------------------------------------
 * Pure per-mode geometry for one reader page.
 *
 * Fit mode always sizes the page so its width covers the width budget (the
 * full viewport at 0% side padding), like a browser rendering an <img> at
 * width:100%. Original mode renders at 1:1 physical pixels (centred, like a
 * desktop browser) and is zoomable in paged / horizontal-scroll layouts.
 *
 * Scroll modes lay each page out along the strip axis: vertical strips get a
 * full-width row, horizontal pages get one full-screen slot each so narrow
 * pages no longer clump together on screen.
 * ---------------------------------------------------------------------------
 */

import { Dimensions } from "react-native";

import type {
  ReaderChromeSettings,
  ReaderReadingMode,
} from "@/components/reader/readerChrome";

export interface PageGeometry {
  itemW: number;
  itemH: number;
  imgW: number;
  imgH: number;
  overlayW: number;
  overlayH: number;
  zoom: boolean;
}

export interface PageDims {
  width: number;
  height: number;
}

const screenWidth = Dimensions.get("window").width;
const screenHeight = Dimensions.get("window").height;

export function pageGeometry(
  url: string,
  mode: ReaderReadingMode,
  fitMode: ReaderChromeSettings["fitMode"],
  sidePadding: number,
  body: { width: number; height: number },
  dims: Record<string, PageDims>,
): PageGeometry {
  const bodyW = body.width || screenWidth;
  const bodyH = body.height || screenHeight;
  const measured = dims[url];
  const naturalW = measured?.width ?? 0;
  const naturalH = measured?.height ?? 0;
  const hasDims = naturalW > 0 && naturalH > 0;
  // Fit-mode width budget: 0% padding = the page occupies the full screen
  // width; higher values shrink the width the page covers.
  const widthFactor = Math.max(
    1 - Math.min(Math.max(sidePadding, 0), 100) / 100,
    0.2,
  );
  const fitTargetW = bodyW * widthFactor;

  if (mode === "scrollVertical") {
    if (!hasDims) {
      // Dimensions not known yet (still loading or the measurement failed):
      // reserve a portrait-ish slot; geometry self-corrects once onLoad
      // reports the decoded size.
      const placeholderH = bodyW * 1.4;
      return {
        itemW: bodyW,
        itemH: placeholderH,
        imgW: bodyW,
        imgH: placeholderH,
        overlayW: bodyW,
        overlayH: placeholderH,
        zoom: true,
      };
    }
    if (fitMode === "fit") {
      // Cover the width budget (upscaling a narrow webtoon strip is intended
      // here - the Android tiled viewer keeps it crisp while scrolling).
      const imgW = screenWidth;
      const imgH = (naturalH * imgW) / naturalW;
      return {
        itemW: bodyW,
        itemH: imgH,
        imgW,
        imgH,
        overlayW: imgW,
        overlayH: imgH,
        zoom: false,
      };
    }
      const imgW = screenWidth;
      const imgH = (naturalH * imgW) / naturalW;
    return {
      itemW: bodyW,
      itemH: bodyH,
      imgW,
      imgH,
      overlayW: imgW,
      overlayH: imgH,
      zoom: true,
    };
  }
  if (mode === "scrollHorizontal") {
    if (!hasDims) {
      const placeholderW = bodyH * 0.71;
      return {
        itemW: bodyW,
        itemH: bodyH,
        imgW: placeholderW,
        imgH: bodyH,
        overlayW: placeholderW,
        overlayH: bodyH,
        zoom: false,
      };
    }
    if (fitMode === "fit") {
      // One full-screen slot per page; the page is contained inside it and
      // fills the width whenever its aspect ratio fits the viewport height.
      const imgW = screenWidth;
      const imgH = (naturalH * imgW) / naturalW;
      return {
        itemW: bodyW,
        itemH: bodyH,
        imgW,
        imgH,
        overlayW: imgW,
        overlayH: imgH,
        zoom: false,
      };
    }
    const imgW = screenWidth;
    const imgH = (naturalH * imgW) / naturalW;
    return {
      itemW: bodyW,
      itemH: bodyH,
      imgW,
      imgH,
      overlayW: imgW,
      overlayH: imgH,
      zoom: true,
    };
  }
  const pagedNaturalW = hasDims ? naturalW : screenWidth * 0.9;
  const pagedNaturalH = hasDims ? naturalH : screenWidth * 0.9;
  if (fitMode === "original") {
    const imgW = screenWidth;
    const imgH = (naturalH * imgW) / naturalW;
    return {
      itemW: bodyW,
      itemH: bodyH,
      imgW: imgW,
      imgH: imgH,
      overlayW: imgW,
      overlayH: imgH,
      zoom: true,
    };
  }
  // Fit pages like scroll mode: fill the width and let tall pages scroll
  // inside their viewport-sized page slot.
  const imgW =  ( fitTargetW * 0.9 ) < screenWidth ? screenWidth * 0.9 : fitTargetW * 0.9;
  const imgH = ((pagedNaturalH * imgW) / pagedNaturalW) * 0.9;
  return {
    itemW: bodyW,
    itemH: bodyH,
    imgW,
    imgH,
    overlayW: imgW,
    overlayH: imgH,
    zoom: false,
  };
}
