/**
 * Reads what an image file really is from its bytes, never from its name or
 * its declared MIME type: the format (from the file's signature), its pixel
 * size and whether it has an alpha channel (from its header). Plain functions
 * over a `Uint8Array`, with no DOM and no Node modules, so the browser and the
 * backend run the same checks on the same bytes.
 *
 * Supported: PNG, JPEG and WebP. Other formats are recognised only to name
 * them in the message ("this is a GIF image"). SVG is not accepted for
 * customer uploads (see upload-checks.ts for why).
 *
 * Only headers are read; the pixels are not decoded. A file whose header is
 * fine but whose pixel data is damaged is caught when the browser decodes it
 * (see react/upload.ts), and by the malware scan planned for M4.
 */
import type { LogoMediaType } from "./schema.js";

export interface ImageHeader {
  mediaType: LogoMediaType;
  width: number;
  height: number;
  /**
   * True when the format and header allow transparent pixels: PNG with an
   * alpha channel or a tRNS chunk, WebP with the alpha flag. JPEG never has
   * one. True does not mean the image has transparent pixels; only the
   * decoded pixels can tell (see `analyseTransparency`).
   */
  alphaChannel: boolean;
  /** True for animated PNG and WebP. */
  animated: boolean;
}

export type ImageHeaderResult = { ok: true; header: ImageHeader } | { ok: false; error: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32le = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/** The format of a file from its first bytes. `null` when it is not PNG, JPEG or WebP. */
export function sniffImageType(bytes: Uint8Array): LogoMediaType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

/** A readable name for common formats that are NOT accepted, for the error message. */
export function describeOtherFormat(bytes: Uint8Array): string | null {
  const head = ascii(bytes, 0, 16);
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "a GIF image";
  if (head.startsWith("BM")) return "a BMP image";
  if (head.startsWith("%PDF")) return "a PDF document";
  if (head.startsWith("PK\u0003\u0004")) return "a ZIP archive (or an Office document)";
  if (head.startsWith("II*\u0000") || head.startsWith("MM\u0000*")) return "a TIFF image";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return "a HEIC image (as iPhones save photos)";
    if (brand === "avif") return "an AVIF image";
    return "a video or ISO media file";
  }
  // Text: an SVG, HTML or plain text file. Skip a UTF-8 byte order mark and leading spaces.
  let text = ascii(bytes, 0, 512).replace(/^ï»¿/, "").trimStart().toLowerCase();
  if (text.startsWith("<?xml")) text = text.replace(/^<\?xml[^>]*>\s*/, "");
  if (text.startsWith("<svg") || (text.startsWith("<!doctype svg"))) return "an SVG file";
  if (text.startsWith("<!doctype html") || text.startsWith("<html")) return "an HTML page";
  if (bytes.length > 0 && Array.from(bytes.subarray(0, 64)).every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127))) {
    return "a text file";
  }
  return null;
}

function readPng(bytes: Uint8Array): ImageHeaderResult {
  // Signature (8), then the IHDR chunk: length (4) = 13, type (4), width, height, depth, colour type ...
  if (bytes.length < 33 || u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") {
    return { ok: false, error: "the PNG file is damaged: its header (IHDR) is missing" };
  }
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  const colourType = bytes[25]!;
  if (![0, 2, 3, 4, 6].includes(colourType)) return { ok: false, error: "the PNG file is damaged: unknown colour type" };
  let alphaChannel = colourType === 4 || colourType === 6;
  let animated = false;
  // Walk the chunks up to the first image data: tRNS (transparency) and acTL (animation) come before IDAT.
  let offset = 8;
  let imageData = false;
  for (let guard = 0; guard < 10_000 && offset + 8 <= bytes.length; guard++) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "IDAT") {
      imageData = true;
      break;
    }
    if (type === "IEND") break;
    if (type === "tRNS") alphaChannel = true;
    if (type === "acTL") animated = true;
    const next = offset + 12 + length;
    if (next <= offset || next > bytes.length) return { ok: false, error: "the PNG file is damaged or cut short" };
    offset = next;
  }
  if (!imageData) return { ok: false, error: "the PNG file is damaged or cut short: it has no image data" };
  return { ok: true, header: { mediaType: "image/png", width, height, alphaChannel, animated } };
}

/** Start-of-frame markers, which hold the image size: C0 to CF except C4 (DHT), C8 (JPG) and CC (DAC). */
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpeg(bytes: Uint8Array): ImageHeaderResult {
  let offset = 2;
  for (let guard = 0; guard < 10_000; guard++) {
    // Markers may be preceded by any number of 0xFF fill bytes.
    while (offset < bytes.length && bytes[offset] === 0xff && bytes[offset + 1] === 0xff) offset++;
    if (offset + 4 > bytes.length) break;
    if (bytes[offset] !== 0xff) return { ok: false, error: "the JPEG file is damaged: a marker is missing" };
    const marker = bytes[offset + 1]!;
    // Markers without a length: TEM and the restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image, or start of scan without a frame header
    const length = u16be(bytes, offset + 2);
    if (length < 2) return { ok: false, error: "the JPEG file is damaged: a segment has no length" };
    if (JPEG_SOF.has(marker)) {
      if (offset + 9 > bytes.length) break;
      const height = u16be(bytes, offset + 5);
      const width = u16be(bytes, offset + 7);
      if (width === 0 || height === 0) return { ok: false, error: "the JPEG file does not state its size" };
      return { ok: true, header: { mediaType: "image/jpeg", width, height, alphaChannel: false, animated: false } };
    }
    offset += 2 + length;
  }
  return { ok: false, error: "the JPEG file is damaged or cut short: no image size found" };
}

function readWebp(bytes: Uint8Array): ImageHeaderResult {
  if (bytes.length < 30) return { ok: false, error: "the WebP file is damaged or cut short" };
  const chunk = ascii(bytes, 12, 4);
  const data = 20;
  if (chunk === "VP8X") {
    const flags = bytes[data]!;
    const width = u24le(bytes, data + 4) + 1;
    const height = u24le(bytes, data + 7) + 1;
    return {
      ok: true,
      header: { mediaType: "image/webp", width, height, alphaChannel: (flags & 0x10) !== 0, animated: (flags & 0x02) !== 0 },
    };
  }
  if (chunk === "VP8L") {
    if (bytes[data] !== 0x2f) return { ok: false, error: "the WebP file is damaged: bad lossless header" };
    const bits = u32le(bytes, data + 1);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    const alphaChannel = ((bits >>> 28) & 1) === 1;
    return { ok: true, header: { mediaType: "image/webp", width, height, alphaChannel, animated: false } };
  }
  if (chunk === "VP8 ") {
    if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) {
      return { ok: false, error: "the WebP file is damaged: bad lossy header" };
    }
    const width = u16le(bytes, data + 6) & 0x3fff;
    const height = u16le(bytes, data + 8) & 0x3fff;
    return { ok: true, header: { mediaType: "image/webp", width, height, alphaChannel: false, animated: false } };
  }
  return { ok: false, error: `the WebP file is damaged: unknown first chunk "${chunk.replace(/[^\x20-\x7e]/g, "?")}"` };
}

const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

/** The format, size and alpha channel of a PNG, JPEG or WebP file, from its bytes. Never throws. */
export function readImageHeader(bytes: Uint8Array): ImageHeaderResult {
  if (!(bytes instanceof Uint8Array)) return { ok: false, error: "the file could not be read (expected bytes)" };
  if (bytes.length === 0) return { ok: false, error: "the file is empty" };
  const type = sniffImageType(bytes);
  if (type === "image/png") return readPng(bytes);
  if (type === "image/jpeg") return readJpeg(bytes);
  if (type === "image/webp") return readWebp(bytes);
  const other = describeOtherFormat(bytes);
  return { ok: false, error: other ? `the file is ${other}, not a PNG, JPEG or WebP image` : "the file is not a PNG, JPEG or WebP image" };
}
