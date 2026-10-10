export type TrappOcrBackend = "manga-ocr" | "paddle-ocr" | "tesseract";

export interface TrappOcrBox {
  text: string;
  confidence: number | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TrappOcrResult {
  text: string;
  backend: TrappOcrBackend;
  language: string;
  width: number;
  height: number;
  boxes: TrappOcrBox[];
}

export interface TrappOcrResponse {
  request_id: string;
  results: TrappOcrResult[];
}

export interface TrappOcrFile {
  uri: string;
  name?: string;
  type?: string;
}

export const TRAPP_OCR_SPACE_URL = "https://ilcapitano01-manga-tr-api.hf.space";

export class TrappOcrClient {
  private readonly baseUrl: string;

  constructor(baseUrl = TRAPP_OCR_SPACE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async recognizeFile(
    file: Blob | TrappOcrFile,
    language: string,
    script?: string,
  ): Promise<TrappOcrResponse> {
    const form = new FormData();
    form.append(
      "file",
      "uri" in file
        ? ({
            uri: file.uri,
            name: file.name ?? "crop.jpg",
            type: file.type ?? "image/jpeg",
          } as unknown as Blob)
        : file,
    );
    form.append("language", language);
    if (script) form.append("script", script);

    const response = await fetch(`${this.baseUrl}/v1/ocr`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Mangora OCR request failed with HTTP ${response.status}`);
    }
    return (await response.json()) as TrappOcrResponse;
  }
}
