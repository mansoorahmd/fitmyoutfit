/**
 * The logo upload flow in the browser: read the file's bytes, run the checks
 * from the design entry (the same ones the backend can run), decode the
 * pixels for the transparency check, then hand the file to the HOST's upload
 * function and keep only the reference it returns. The design never holds
 * the image's bytes: a logo layer holds `{ assetId, mediaType, width, height }`.
 *
 * The host supplies `upload` (the store: its storage API; the demo: an
 * in-memory store). The editor does not know where files go.
 */
import { ID_PATTERN, type LogoAssetRef } from "../design/schema.js";
import {
  DEFAULT_UPLOAD_LIMITS,
  analyseTransparency,
  checkLogoFile,
  fileSizeIssue,
  transparencyIssue,
  type UploadIssue,
  type UploadLimits,
} from "../design/upload-checks.js";
import { uprightSize, type ImageHeader } from "../design/image-file.js";

/** What the host's upload function receives: the original bytes, never re-encoded, and what the checks found. */
export interface AssetUploadRequest {
  bytes: Uint8Array;
  /** The real type, from the file's content (not its name). */
  mediaType: LogoAssetRef["mediaType"];
  width: number;
  height: number;
  /** The file's name, for the host's records only; nothing is decided from it. */
  fileName: string;
}

/** Supplied by the host: stores the file and returns its id in asset storage. */
export type AssetUploader = (request: AssetUploadRequest) => Promise<{ assetId: string }>;

/** Decoded pixels (RGBA, row by row), possibly scaled down. */
export interface DecodedPixels {
  rgba: ArrayLike<number>;
  width: number;
  height: number;
  /** The image's own size, as the decoder read it. */
  naturalWidth: number;
  naturalHeight: number;
}

/** Decodes an image file into pixels. The default uses the browser; tests pass their own. */
export type PixelDecoder = (file: Blob, header: ImageHeader) => Promise<DecodedPixels>;

export interface LogoUploadOptions {
  upload: AssetUploader;
  limits?: UploadLimits;
  /** Default: `decodeWithBrowser`. Pass `null` to skip the pixel checks (the header checks still run). */
  decode?: PixelDecoder | null;
}

export type LogoUploadResult =
  | { ok: true; asset: LogoAssetRef; issues: UploadIssue[] }
  | { ok: false; issues: UploadIssue[] };

/** The longest side the pixels are scaled to for the transparency check. */
export const TRANSPARENCY_SAMPLE_PX = 256;

/**
 * Checks a file and, when no check fails, uploads it with the host's function.
 * Errors stop the upload; warnings (no transparent background) are returned
 * with the asset. Never throws for a bad file or a failed upload.
 */
export async function uploadLogo(file: Blob, options: LogoUploadOptions): Promise<LogoUploadResult> {
  const limits = options.limits ?? DEFAULT_UPLOAD_LIMITS;
  const error = (code: UploadIssue["code"], message: string): LogoUploadResult => ({ ok: false, issues: [{ code, severity: "error", message }] });
  // Do not even read a file that is too big.
  const tooBig = fileSizeIssue(file.size, limits);
  if (tooBig) return { ok: false, issues: [tooBig] };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return error("damaged", "The file could not be read.");
  }
  const check = checkLogoFile(bytes, limits);
  if (!check.ok || !check.header) return { ok: false, issues: check.issues };
  const header = check.header;
  const issues = [...check.issues];

  const decode = options.decode === undefined ? decodeWithBrowser : options.decode;
  if (decode) {
    let pixels: DecodedPixels;
    try {
      pixels = await decode(new Blob([bytes as BlobPart], { type: header.mediaType }), header);
    } catch {
      return error("damaged", "The image could not be opened: the file is damaged or not a complete image.");
    }
    // A photo with an EXIF orientation opens turned (browsers show it upright); a decoder that ignores the
    // tag opens it as stored. Either is the same picture (B5).
    const seen = uprightSize(header);
    const opensAsStored = pixels.naturalWidth === header.width && pixels.naturalHeight === header.height;
    const opensUpright = pixels.naturalWidth === seen.width && pixels.naturalHeight === seen.height;
    if (!opensAsStored && !opensUpright) {
      return error("damaged", `The image's header says ${header.width} x ${header.height} pixels but it opens as ${pixels.naturalWidth} x ${pixels.naturalHeight}; the file is damaged.`);
    }
    if (header.alphaChannel) {
      const found = transparencyIssue(analyseTransparency(pixels.rgba, pixels.width, pixels.height, limits), header.mediaType);
      if (found) issues.push(found);
    }
  }

  // The size the picture is seen at (upright): its proportions on the kit and its sharpness come from it.
  const { width, height } = uprightSize(header);
  let stored: { assetId: string };
  try {
    stored = await options.upload({
      bytes,
      mediaType: header.mediaType,
      width,
      height,
      fileName: file instanceof File ? file.name : "",
    });
  } catch (e) {
    return { ok: false, issues: [...issues, { code: "damaged", severity: "error", message: `The upload failed: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  if (typeof stored?.assetId !== "string" || !ID_PATTERN.test(stored.assetId)) {
    return { ok: false, issues: [...issues, { code: "damaged", severity: "error", message: "The upload failed: the storage returned no usable asset id." }] };
  }
  return { ok: true, asset: { assetId: stored.assetId, mediaType: header.mediaType, width, height }, issues };
}

/** Decodes with `createImageBitmap` and a canvas, scaled so the longest side is at most TRANSPARENCY_SAMPLE_PX. */
export const decodeWithBrowser: PixelDecoder = async (file) => {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, TRANSPARENCY_SAMPLE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("no 2D canvas");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height);
    return { rgba: data.data, width, height, naturalWidth: bitmap.width, naturalHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
};
