/**
 * Test images, made by code (nothing downloaded): real PNG files (deflated
 * with node:zlib, with CRCs, so any decoder opens them) and the headers of
 * JPEG and WebP files, which is all the upload checks read.
 */
import { deflateSync, inflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([text(type), data]);
  return concat([u32(data.length), typed, u32(crc32(typed))]);
}

export interface PngOptions {
  width: number;
  height: number;
  /** RGBA for each pixel; default: a filled circle on a transparent background. */
  pixel?: (x: number, y: number) => [number, number, number, number];
  /** 6 = RGBA (default), 2 = RGB (no alpha channel). */
  colourType?: 2 | 6;
  /** Adds an acTL chunk, as an animated PNG has. */
  animated?: boolean;
}

/** A circle badge: opaque inside, transparent outside. */
export const badge = (width: number, height: number) => (x: number, y: number): [number, number, number, number] => {
  const dx = (x + 0.5) / width - 0.5;
  const dy = (y + 0.5) / height - 0.5;
  return dx * dx + dy * dy < 0.2 ? [200, 16, 46, 255] : [0, 0, 0, 0];
};

/** A real PNG file. */
export function makePng({ width, height, pixel, colourType = 6, animated = false }: PngOptions): Uint8Array {
  const paint = pixel ?? badge(width, height);
  const channels = colourType === 6 ? 4 : 3;
  const raw = new Uint8Array(height * (1 + width * channels));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      if (channels === 4) raw[o++] = a;
    }
  }
  const ihdr = concat([u32(width), u32(height), new Uint8Array([8, colourType, 0, 0, 0])]);
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...(animated ? [chunk("acTL", concat([u32(2), u32(0)]))] : []),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** The start of a JPEG file up to its frame header (what the checks read). */
export function makeJpegHeader(width: number, height: number, sof = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...text("JFIF\0"), 1, 1, 0, 0, 72, 0, 72, 0, 0];
  const dqt = [0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array<number>(64).fill(1)];
  const sofSegment = [0xff, sof, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xff, ...dqt, ...sofSegment, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

function riff(chunkType: string, data: number[]): Uint8Array {
  const body = [...text("WEBP"), ...text(chunkType), ...le32(data.length), ...data];
  return new Uint8Array([...text("RIFF"), ...le32(body.length), ...body]);
}

/** A WebP file header: lossy (VP8), lossless (VP8L) or extended (VP8X). */
export function makeWebpHeader(
  kind: "lossy" | "lossless" | "extended",
  width: number,
  height: number,
  options: { alpha?: boolean; animated?: boolean } = {},
): Uint8Array {
  if (kind === "lossy") {
    return riff("VP8 ", [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, width & 255, (width >> 8) & 0x3f, height & 255, (height >> 8) & 0x3f, ...new Array<number>(10).fill(0)]);
  }
  if (kind === "lossless") {
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | ((options.alpha ? 1 : 0) << 28);
    return riff("VP8L", [0x2f, ...le32(bits >>> 0), ...new Array<number>(10).fill(0)]);
  }
  const flags = (options.alpha ? 0x10 : 0) | (options.animated ? 0x02 : 0);
  return riff("VP8X", [flags, 0, 0, 0, ...le24(width - 1), ...le24(height - 1), ...new Array<number>(8).fill(0)]);
}

/** RGBA pixels, as canvas getImageData gives them. */
export function rgba(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out.set(pixel(x, y), (y * width + x) * 4);
  }
  return out;
}

/**
 * Decodes a PNG made by `makePng` (8-bit RGB or RGBA, filter 0) into RGBA,
 * standing in for the browser's decoder in tests. Throws for anything else.
 */
export function decodeTestPng(bytes: Uint8Array): { rgba: Uint8ClampedArray; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colourType = 6;
  const data: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (body.length !== length) throw new Error("cut short");
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      colourType = bytes[offset + 17]!;
    } else if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(concat(data));
  const channels = colourType === 6 ? 4 : 3;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * channels);
    if (raw[row] !== 0) throw new Error("only filter 0 is supported");
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * channels;
      out.set([raw[p]!, raw[p + 1]!, raw[p + 2]!, channels === 4 ? raw[p + 3]! : 255], (y * width + x) * 4);
    }
  }
  return { rgba: out, width, height };
}
