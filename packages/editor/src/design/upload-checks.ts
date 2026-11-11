/**
 * Checks for a customer's logo upload, as plain functions with their limits
 * held as data (`DEFAULT_UPLOAD_LIMITS`), so the backend can run the same
 * checks on the same bytes and pass limits from its own settings.
 *
 * An ERROR blocks the upload; a WARNING does not (the customer is told, and
 * can go on).
 *
 * - File type, by content: PNG, JPEG or WebP (see image-file.ts). A GIF or a
 *   text file renamed to `.png` is refused; the name is never trusted.
 * - Size limits: the file size in bytes and the pixel dimensions (each side
 *   and the total pixel count), plus a smallest usable side.
 * - Animation: animated PNG and WebP are refused (only one frame would print).
 * - Transparency: a warning when the logo has no transparent background,
 *   because it will print as a box. The header tells when a file cannot have
 *   transparency at all (JPEG, PNG without alpha); when it can, the decoded
 *   pixels decide (`analyseTransparency`, run where pixels are available).
 * - Resolution: a warning when the logo, at the size it is placed on the
 *   garment, has fewer than `minDpi` pixels per inch. It depends on the
 *   placement, so it is recalculated from the layer (`logoLayerWarnings`).
 *
 * SVG is NOT accepted for uploads in this step. Checking an SVG safely (no
 * scripts, no external references, no embedded foreign content, no XML
 * entity tricks) needs a real XML parser and an allow-list sanitiser that
 * works the same on the server; a hand-written check would not be solid. See
 * README "Logo uploads".
 */
import { LOGO_MEDIA_TYPES, type Layer, type LogoMediaType, type Size } from "./schema.js";
import { readImageHeader, type ImageHeader } from "./image-file.js";

export interface UploadLimits {
  /** Accepted formats, by content. */
  readonly acceptedTypes: readonly LogoMediaType[];
  /** Largest file, in bytes. */
  readonly maxFileBytes: number;
  /** Longest allowed side, in pixels. */
  readonly maxSidePx: number;
  /** Largest pixel count (width times height): decoding a huge image can stop a phone. */
  readonly maxPixels: number;
  /** Shortest usable side, in pixels. Smaller images are refused. */
  readonly minSidePx: number;
  /** Below this print resolution, at the placed size, the customer is warned. */
  readonly minDpi: number;
  /** A pixel counts as transparent when its alpha (0 to 255) is at most this. */
  readonly transparentAlphaMax: number;
  /**
   * The logo "has a transparent background" when at least this share of the
   * pixels along its outer edge are transparent. A logo drawn edge to edge on a
   * solid background has none.
   */
  readonly minTransparentEdgeShare: number;
}

/** Placeholder limits, as data. The real values come from the factories' print specifications. */
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = Object.freeze({
  acceptedTypes: Object.freeze([...LOGO_MEDIA_TYPES]),
  maxFileBytes: 10 * 1024 * 1024,
  maxSidePx: 8000,
  maxPixels: 40_000_000,
  minSidePx: 16,
  minDpi: 150,
  transparentAlphaMax: 16,
  minTransparentEdgeShare: 0.25,
});

export type UploadIssueCode = "file-type" | "file-size" | "dimensions" | "animated" | "damaged" | "transparency" | "resolution";

export interface UploadIssue {
  code: UploadIssueCode;
  severity: "error" | "warning";
  message: string;
}

export interface LogoFileCheck {
  /** False when any issue is an error: the upload must not go on. */
  ok: boolean;
  /** What the file really is. Absent when the file could not be read as an image. */
  header?: ImageHeader;
  issues: UploadIssue[];
}

const MB = 1024 * 1024;
function formatBytes(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

const NAMES: Record<LogoMediaType, string> = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" };

/** Returns a description of what is wrong with a limits object, or null. */
export function checkUploadLimits(limits: unknown): string | null {
  const l = limits as Partial<UploadLimits> | null;
  if (typeof l !== "object" || l === null) return "the upload limits must be an object";
  const positive = ["maxFileBytes", "maxSidePx", "maxPixels", "minSidePx", "minDpi"] as const;
  for (const key of positive) {
    const value = l[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return `the upload limits need '${key}' to be a positive number`;
  }
  if (typeof l.transparentAlphaMax !== "number" || l.transparentAlphaMax < 0 || l.transparentAlphaMax > 255) {
    return "the upload limits need 'transparentAlphaMax' between 0 and 255";
  }
  if (typeof l.minTransparentEdgeShare !== "number" || l.minTransparentEdgeShare < 0 || l.minTransparentEdgeShare > 1) {
    return "the upload limits need 'minTransparentEdgeShare' between 0 and 1";
  }
  if (!Array.isArray(l.acceptedTypes) || l.acceptedTypes.length === 0 || !l.acceptedTypes.every((t) => (LOGO_MEDIA_TYPES as readonly string[]).includes(t))) {
    return `the upload limits need 'acceptedTypes' to list some of ${LOGO_MEDIA_TYPES.join(", ")}`;
  }
  if (l.minSidePx! > l.maxSidePx!) return "the upload limits have 'minSidePx' larger than 'maxSidePx'";
  return null;
}

function usableLimits(limits: UploadLimits): UploadLimits {
  const problem = checkUploadLimits(limits);
  if (problem) throw new RangeError(`Invalid upload limits: ${problem}`);
  return limits;
}

/**
 * Checks an uploaded logo file from its bytes: type, file size, dimensions,
 * animation, and (from the header) whether it can be transparent at all.
 * Never throws for a bad file; throws a `RangeError` for unusable limits.
 */
export function checkLogoFile(bytes: Uint8Array, limits: UploadLimits = DEFAULT_UPLOAD_LIMITS): LogoFileCheck {
  const { acceptedTypes, maxFileBytes, maxSidePx, maxPixels, minSidePx } = usableLimits(limits);
  const issues: UploadIssue[] = [];
  const error = (code: UploadIssueCode, message: string) => issues.push({ code, severity: "error", message });

  if (!(bytes instanceof Uint8Array)) {
    error("damaged", "The file could not be read.");
    return { ok: false, issues };
  }
  if (bytes.length > maxFileBytes) {
    error("file-size", `The file is ${formatBytes(bytes.length)}; the largest accepted is ${formatBytes(maxFileBytes)}.`);
  }
  const read = readImageHeader(bytes);
  if (!read.ok) {
    const damaged = read.error.includes("damaged") || read.error.includes("cut short") || read.error.includes("does not state");
    error(damaged ? "damaged" : "file-type", `${capitalise(read.error)}. ${acceptedList(acceptedTypes)}`);
    return { ok: false, issues };
  }
  const header = read.header;
  if (!acceptedTypes.includes(header.mediaType)) {
    error("file-type", `The file is a ${NAMES[header.mediaType]} image. ${acceptedList(acceptedTypes)}`);
  }
  const { width, height } = header;
  if (width > maxSidePx || height > maxSidePx) {
    error("dimensions", `The image is ${width} x ${height} pixels; the longest side may be ${maxSidePx} pixels.`);
  } else if (width * height > maxPixels) {
    error("dimensions", `The image has ${(width * height / 1e6).toFixed(1)} million pixels; the most accepted is ${(maxPixels / 1e6).toFixed(1)} million.`);
  }
  if (width < minSidePx || height < minSidePx) {
    error("dimensions", `The image is ${width} x ${height} pixels, too small to print; each side needs at least ${minSidePx} pixels.`);
  }
  if (header.animated) error("animated", "Animated images are not accepted: only one frame would print. Upload a still image.");
  if (!header.alphaChannel) issues.push(noTransparencyWarning(header.mediaType));
  return { ok: !issues.some((i) => i.severity === "error"), header, issues };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function acceptedList(types: readonly LogoMediaType[]): string {
  return `Upload a ${types.map((t) => NAMES[t]).join(", ").replace(/, ([^,]*)$/, " or $1")} file.`;
}

function noTransparencyWarning(mediaType: LogoMediaType | null): UploadIssue {
  const why = mediaType === "image/jpeg" ? "JPEG images cannot be transparent, so " : "";
  return {
    code: "transparency",
    severity: "warning",
    message: `This logo has no transparent background: ${why}it will print as a box with its background colour. Use a PNG or WebP with a transparent background if you want only the logo.`,
  };
}

export interface TransparencyAnalysis {
  /** Share of all pixels that are transparent, 0 to 1. */
  transparentShare: number;
  /** Share of the pixels along the outer edge that are transparent, 0 to 1. */
  edgeTransparentShare: number;
  /** The rule's answer: enough of the edge is transparent. */
  hasTransparentBackground: boolean;
}

/**
 * Looks at decoded pixels (RGBA, 4 bytes per pixel, row by row, as canvas
 * `getImageData` gives them; any resolution, a scaled-down copy is fine).
 */
export function analyseTransparency(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
): TransparencyAnalysis {
  const { transparentAlphaMax, minTransparentEdgeShare } = usableLimits(limits);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length < width * height * 4) {
    throw new RangeError("analyseTransparency: the pixel data does not match the width and height");
  }
  const clear = (x: number, y: number) => rgba[(y * width + x) * 4 + 3]! <= transparentAlphaMax;
  let transparent = 0;
  for (let k = 3; k < width * height * 4; k += 4) if (rgba[k]! <= transparentAlphaMax) transparent++;
  let edge = 0;
  let edgeClear = 0;
  for (let x = 0; x < width; x++) {
    edge++;
    if (clear(x, 0)) edgeClear++;
    if (height > 1) {
      edge++;
      if (clear(x, height - 1)) edgeClear++;
    }
  }
  for (let y = 1; y < height - 1; y++) {
    edge++;
    if (clear(0, y)) edgeClear++;
    if (width > 1) {
      edge++;
      if (clear(width - 1, y)) edgeClear++;
    }
  }
  const edgeTransparentShare = edgeClear / edge;
  return {
    transparentShare: transparent / (width * height),
    edgeTransparentShare,
    hasTransparentBackground: edgeTransparentShare >= minTransparentEdgeShare && transparent > 0,
  };
}

/** The transparency warning for decoded pixels, or null when the background is transparent. */
export function transparencyIssue(analysis: TransparencyAnalysis, mediaType: LogoMediaType): UploadIssue | null {
  return analysis.hasTransparentBackground ? null : noTransparencyWarning(mediaType);
}

// Print resolution.

export const MM_PER_INCH = 25.4;

/**
 * The size a logo is printed at, in mm: as large as fits inside the layer box
 * while keeping the image's proportions (the way the texture draws it).
 */
export function logoPrintSize(box: Size, imageWidthPx: number, imageHeightPx: number): Size {
  const aspect = imageWidthPx / imageHeightPx;
  const width = Math.min(box.width, box.height * aspect);
  return { width, height: width / aspect };
}

/** Pixels per inch of an image printed `printWidthMm` wide. */
export function printDpi(imageWidthPx: number, printWidthMm: number): number {
  return imageWidthPx / (printWidthMm / MM_PER_INCH);
}

/** The print resolution of a logo layer at its current size, in dots (pixels) per inch. */
export function logoLayerDpi(layer: Extract<Layer, { kind: "logo" }>): number {
  const printed = logoPrintSize(layer.size, layer.asset.width, layer.asset.height);
  return printDpi(layer.asset.width, printed.width);
}

/** The widest a logo can be printed (mm) and still reach `minDpi`. */
export function maxPrintWidthMm(imageWidthPx: number, minDpi: number = DEFAULT_UPLOAD_LIMITS.minDpi): number {
  return (imageWidthPx / minDpi) * MM_PER_INCH;
}

/**
 * Warnings for a placed logo layer, from the design data alone (the asset
 * reference holds the pixel size): today the resolution at the placed size.
 * Call it again after every resize; the backend can call it at order time.
 */
export function logoLayerWarnings(layer: Layer, limits: UploadLimits = DEFAULT_UPLOAD_LIMITS): UploadIssue[] {
  if (layer.kind !== "logo") return [];
  const { minDpi } = usableLimits(limits);
  const dpi = logoLayerDpi(layer);
  if (dpi >= minDpi) return [];
  const printed = logoPrintSize(layer.size, layer.asset.width, layer.asset.height);
  return [
    {
      code: "resolution",
      severity: "warning",
      message:
        `At ${Math.round(printed.width)} x ${Math.round(printed.height)} mm this logo prints at ${Math.round(dpi)} DPI, ` +
        `below the ${minDpi} DPI needed for a sharp print. Make it smaller than ${Math.floor(maxPrintWidthMm(layer.asset.width, minDpi))} mm wide, or upload a larger image.`,
    },
  ];
}
