/**
 * ocr.types.ts
 * -----------------------------------------------------------------------
 * Type definitions and error classes for the OCR.space API SDK.
 * API reference: https://ocr.space/ocrapi
 * -----------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface OcrClientConfig {
  /** Your OCR.space API key. Get one free at https://ocr.space/ocrapi/freekey */
  apiKey: string;
  /**
   * Base API URL. Defaults to the free/shared endpoint (https://api.ocr.space).
   * PRO accounts get a dedicated regional URL in their welcome email — pass it here to use it.
   */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default 30000. Increase for large PDFs, isTable, or Engine 3. */
  timeoutMs?: number;
  /** Retries for transient failures (network errors, timeouts, 5xx, 429). Default 2. */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff between retries. Default 500. */
  retryDelayMs?: number;
  /** If true, also throw OcrApiError when OCRExitCode === 2 (partial success). Default false. */
  throwOnPartialSuccess?: boolean;
}



/** 3-letter language codes supported by the API, plus "auto" (Engine 2/3 only). */
export type OcrLanguage =
  | 'ara' | 'bul' | 'chs' | 'cht' | 'hrv' | 'cze' | 'dan' | 'dut' | 'eng'
  | 'fin' | 'fre' | 'ger' | 'gre' | 'hun' | 'kor' | 'ita' | 'jpn' | 'pol'
  | 'por' | 'rus' | 'slv' | 'spa' | 'swe' | 'tha' | 'tur' | 'ukr' | 'vnm'
  | 'auto';

/** 1 = legacy/fast, 2 = default/best all-round, 3 = most accurate (handwriting, tables, 200+ languages). */
export type OcrEngine = 1 | 2 | 3;

export type OcrFileType = 'PDF' | 'GIF' | 'PNG' | 'JPG' | 'TIF' | 'BMP';

export interface OcrRequestOptions {
  /** Default: "eng" (Engine 1) or "auto" (Engine 2/3). */
  language?: OcrLanguage;
  /** Return word-level bounding boxes. Default false. Forced true if isCreateSearchablePdf is true. */
  isOverlayRequired?: boolean;
  /** Overrides automatic file-type detection from the Content-Type header. */
  filetype?: OcrFileType;
  /** Auto-rotate the image and report the detected rotation in TextOrientation. */
  detectOrientation?: boolean;
  /** Generate a searchable (sandwich) PDF. Free tier adds a watermark. */
  isCreateSearchablePdf?: boolean;
  /** Hide the text layer of the generated searchable PDF. Only applies with isCreateSearchablePdf. */
  isSearchablePdfHideTextLayer?: boolean;
  /** Internal upscaling — helps with low-resolution scans. Default false. */
  scale?: boolean;
  /** Force line-by-line output. Recommended for tables, receipts, invoices. */
  isTable?: boolean;
  /** OCR engine selection. Default 2 if omitted. */
  OCREngine?: OcrEngine;
}

/**
 * A file to upload directly (multipart), as opposed to referencing it by URL.
 * Covers the shapes you'll realistically have on React Native or Node.
 */
export type OcrFileInput =
  /** React Native asset from image-picker / camera / document-picker. */
  | { uri: string; name?: string; type?: string }
  /** A standard Blob/File — available in browsers and Node 18+. */
  | Blob
  /** Raw bytes. A Node Buffer satisfies Uint8Array, so Buffer works here directly. */
  | { data: Uint8Array | ArrayBuffer; name: string; type: string };

/** Exactly one of these three input sources must be provided per request. */
export type OcrSource =
  | { url: string; base64Image?: never; file?: never }
  | { base64Image: string; url?: never; file?: never }
  | { file: OcrFileInput; url?: never; base64Image?: never };

export type OcrParseRequest = OcrSource & OcrRequestOptions;

// ---------------------------------------------------------------------------
// Response shapes — https://ocr.space/ocrapi#Response
// ---------------------------------------------------------------------------

export interface OcrWord {
  WordText: string;
  Left: number;
  Top: number;
  Height: number;
  Width: number;
}

export interface OcrLine {
  Words: OcrWord[];
  MaxHeight: number;
  MinTop: number;
}

export interface OcrTextOverlay {
  Lines: OcrLine[];
  HasOverlay: boolean;
  Message: string | null;
}

/**
 * Per-file/page exit code.
 * 0 = file not found, 1 = success, -10 = OCR engine parse error,
 * -20 = timeout, -30 = validation error, -99 = unknown error.
 */
export type FileParseExitCode = 0 | 1 | -10 | -20 | -30 | -99;

export interface OcrParsedResult {
  TextOverlay: OcrTextOverlay | null;
  FileParseExitCode: FileParseExitCode;
  ParsedText: string | null;
  ErrorMessage: string | null;
  ErrorDetails: string | null;
  /** Present in some multi-file / multi-page responses. */
  ParsedTextFileName?: string;
}

/**
 * Overall exit code.
 * 1 = all parsed successfully, 2 = parsed partially, 3 = all pages failed, 4 = fatal error.
 */
export type OcrExitCode = 1 | 2 | 3 | 4;

export interface OcrApiResponse {
  ParsedResults: OcrParsedResult[] | null;
  OCRExitCode: OcrExitCode;
  IsErroredOnProcessing: boolean;
  ErrorMessage: string | string[] | null;
  ErrorDetails: string | null;
  /** Present only when isCreateSearchablePdf=true. Download link valid for ~1 hour. */
  SearchablePDFURL?: string | null;
  ProcessingTimeInMilliseconds: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base class for every error this SDK throws. Safe to catch with `instanceof OcrError`. */
export class OcrError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'OcrError';
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown before any network call — bad/missing input (e.g. no source, or more than one source). */
export class OcrValidationError extends OcrError {
  constructor(message: string) {
    super(message);
    this.name = 'OcrValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when fetch itself fails (offline, DNS, TLS, etc.) — not an API-level error. */
export class OcrNetworkError extends OcrError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'OcrNetworkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when our own timeout (config.timeoutMs) fires before the API responds. */
export class OcrTimeoutError extends OcrError {
  constructor(message = 'OCR request timed out') {
    super(message);
    this.name = 'OcrTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the HTTP response is a non-2xx (e.g. 403 invalid key, 500 server error). */
export class OcrHttpError extends OcrError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'OcrHttpError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the HTTP call succeeds but the OCR API itself reports failure
 * (IsErroredOnProcessing=true, OCRExitCode 3/4, or optionally 2 —
 * see OcrClientConfig.throwOnPartialSuccess).
 */
export class OcrApiError extends OcrError {
  constructor(
    message: string,
    public readonly ocrExitCode: OcrExitCode,
    public readonly errorMessage: string | string[] | null,
    public readonly errorDetails: string | null,
    public readonly response: OcrApiResponse
  ) {
    super(message);
    this.name = 'OcrApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}