import { describe, expect, it } from "vitest";
import { describeOtherFormat, readImageHeader, sniffImageType } from "./image-file";
import {
  DEFAULT_UPLOAD_LIMITS,
  analyseTransparency,
  checkLogoFile,
  checkUploadLimits,
  logoLayerDpi,
  logoLayerWarnings,
  logoPrintSize,
  maxPrintWidthMm,
  printDpi,
  transparencyIssue,
  type UploadLimits,
} from "./upload-checks";
import { badge, makeJpegHeader, makePng, makeWebpHeader, rgba } from "../test/images";
import type { Layer } from "./schema";

const text = (s: string) => new TextEncoder().encode(s);
const codes = (bytes: Uint8Array, limits?: UploadLimits) => checkLogoFile(bytes, limits).issues.map((i) => `${i.severity}:${i.code}`);

describe("file type, by content", () => {
  it("recognises PNG, JPEG and WebP from their bytes", () => {
    expect(sniffImageType(makePng({ width: 4, height: 4 }))).toBe("image/png");
    expect(sniffImageType(makeJpegHeader(10, 10))).toBe("image/jpeg");
    expect(sniffImageType(makeWebpHeader("lossy", 10, 10))).toBe("image/webp");
    expect(sniffImageType(text("hello"))).toBeNull();
  });

  it("refuses a GIF renamed to .png: the name is never looked at, only the bytes", () => {
    const gif = new Uint8Array([...text("GIF89a"), 1, 0, 1, 0, 0, 0, 0]);
    const result = checkLogoFile(gif);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { code: "file-type", severity: "error", message: "The file is a GIF image, not a PNG, JPEG or WebP image. Upload a PNG, JPEG or WebP file." },
    ]);
  });

  it.each([
    ["a text file", text("just some notes, renamed to logo.png\n")],
    ["an SVG file", text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["an HTML page", text("<!DOCTYPE html><html><body></body></html>")],
    ["a PDF document", text("%PDF-1.7\n...")],
    ["a ZIP archive (or an Office document)", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0])],
    ["a BMP image", new Uint8Array([0x42, 0x4d, 0, 0, 0, 0, 0, 0])],
    ["a HEIC image (as iPhones save photos)", new Uint8Array([0, 0, 0, 24, ...text("ftypheic"), 0, 0, 0, 0])],
  ])("refuses %s and names it", (name, bytes) => {
    expect(describeOtherFormat(bytes)).toBe(name);
    const result = checkLogoFile(bytes);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: "file-type", severity: "error" });
    expect(result.issues[0]!.message).toContain(name);
  });

  it("refuses an empty file and bytes that are not an image at all", () => {
    expect(checkLogoFile(new Uint8Array(0)).issues[0]!.message).toContain("The file is empty");
    expect(checkLogoFile(new Uint8Array([1, 2, 3, 250])).issues[0]!.message).toContain("not a PNG, JPEG or WebP image");
    expect(checkLogoFile("not bytes" as never).ok).toBe(false);
  });

  it("refuses a file that starts like a PNG but is cut short", () => {
    const cut = makePng({ width: 64, height: 64 }).subarray(0, 20);
    expect(checkLogoFile(cut).issues[0]).toMatchObject({ code: "damaged", severity: "error" });
    // Cut after the header chunk: no image data.
    const png = makePng({ width: 64, height: 64, animated: true });
    expect(readImageHeader(png.subarray(0, 33))).toMatchObject({ ok: false, error: expect.stringContaining("no image data") });
    // Cut inside a chunk before the image data.
    expect(readImageHeader(png.subarray(0, 40))).toMatchObject({ ok: false, error: expect.stringContaining("cut short") });
  });

  it("does not trust damaged pixel data it cannot see: the header alone is read here, the browser decode catches the rest", () => {
    const png = makePng({ width: 64, height: 64 });
    expect(readImageHeader(png.subarray(0, png.length - 30))).toMatchObject({ ok: true });
  });

  it("refuses a type the limits do not accept, even when it is a real image", () => {
    const pngOnly = { ...DEFAULT_UPLOAD_LIMITS, acceptedTypes: ["image/png" as const] };
    expect(codes(makeJpegHeader(800, 600), pngOnly)).toContain("error:file-type");
  });
});

describe("reading the image header", () => {
  it("PNG: size and alpha channel from IHDR, transparency chunk, animation", () => {
    expect(readImageHeader(makePng({ width: 300, height: 120 }))).toEqual({
      ok: true,
      header: { mediaType: "image/png", width: 300, height: 120, alphaChannel: true, animated: false },
    });
    expect(readImageHeader(makePng({ width: 30, height: 20, colourType: 2 }))).toMatchObject({ header: { alphaChannel: false } });
    expect(readImageHeader(makePng({ width: 30, height: 20, animated: true }))).toMatchObject({ header: { animated: true } });
  });

  it("JPEG: size from the frame header, baseline or progressive, never an alpha channel", () => {
    expect(readImageHeader(makeJpegHeader(1920, 1080))).toEqual({
      ok: true,
      header: { mediaType: "image/jpeg", width: 1920, height: 1080, alphaChannel: false, animated: false },
    });
    expect(readImageHeader(makeJpegHeader(640, 480, 0xc2))).toMatchObject({ header: { width: 640, height: 480 } });
  });

  it("JPEG: a file with no frame header is damaged", () => {
    const noFrame = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xd9]);
    expect(readImageHeader(noFrame)).toMatchObject({ ok: false });
  });

  it("WebP: lossy, lossless and extended headers", () => {
    expect(readImageHeader(makeWebpHeader("lossy", 1000, 500))).toMatchObject({ header: { width: 1000, height: 500, alphaChannel: false } });
    expect(readImageHeader(makeWebpHeader("lossless", 640, 360, { alpha: true }))).toMatchObject({ header: { width: 640, height: 360, alphaChannel: true } });
    expect(readImageHeader(makeWebpHeader("extended", 4000, 3000, { alpha: true }))).toMatchObject({ header: { width: 4000, height: 3000, alphaChannel: true, animated: false } });
    expect(readImageHeader(makeWebpHeader("extended", 400, 300, { animated: true }))).toMatchObject({ header: { animated: true } });
  });
});

describe("size limits", () => {
  it("accept a transparent PNG within every limit, with no issue at all", () => {
    expect(checkLogoFile(makePng({ width: 600, height: 600 }))).toMatchObject({ ok: true, issues: [] });
  });

  it("refuse a file larger than the byte limit", () => {
    const limits = { ...DEFAULT_UPLOAD_LIMITS, maxFileBytes: 1000 };
    const big = makePng({ width: 200, height: 200, pixel: (x, y) => [x % 256, y % 256, (x * y) % 256, 255] });
    expect(big.length).toBeGreaterThan(1000);
    const result = checkLogoFile(big, limits);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: "file-size", severity: "error" });
    expect(result.issues[0]!.message).toMatch(/^The file is \d+ KB; the largest accepted is 1 KB\.$/);
  });

  it("refuse a file over the default 10 MB, whatever it holds", () => {
    const huge = new Uint8Array(DEFAULT_UPLOAD_LIMITS.maxFileBytes + 1);
    huge.set(makePng({ width: 100, height: 100 }));
    expect(checkLogoFile(huge).issues[0]).toMatchObject({ code: "file-size", message: "The file is 10.0 MB; the largest accepted is 10.0 MB." });
  });

  it("refuse too many pixels, a side that is too long, and an image too small to print", () => {
    expect(codes(makeWebpHeader("extended", 9000, 100, { alpha: true }))).toEqual(["error:dimensions"]);
    expect(codes(makeWebpHeader("extended", 7000, 7000, { alpha: true }))).toEqual(["error:dimensions"]);
    expect(checkLogoFile(makeWebpHeader("extended", 7000, 7000, { alpha: true })).issues[0]!.message).toContain("49.0 million pixels");
    expect(codes(makePng({ width: 10, height: 300 }))).toEqual(["error:dimensions"]);
  });

  it("refuse animated images", () => {
    expect(codes(makePng({ width: 64, height: 64, animated: true }))).toEqual(["error:animated"]);
  });

  it("limits are data: other limits change the result", () => {
    const strict = { ...DEFAULT_UPLOAD_LIMITS, maxSidePx: 500 };
    expect(checkLogoFile(makePng({ width: 600, height: 600 }), strict).ok).toBe(false);
    expect(checkLogoFile(makePng({ width: 600, height: 600 })).ok).toBe(true);
  });

  it("unusable limits throw a RangeError (a programming error, not a bad file)", () => {
    expect(checkUploadLimits(DEFAULT_UPLOAD_LIMITS)).toBeNull();
    expect(checkUploadLimits({ ...DEFAULT_UPLOAD_LIMITS, minDpi: 0 })).toContain("minDpi");
    expect(checkUploadLimits({ ...DEFAULT_UPLOAD_LIMITS, acceptedTypes: ["image/gif"] })).toContain("acceptedTypes");
    expect(() => checkLogoFile(makePng({ width: 4, height: 4 }), { ...DEFAULT_UPLOAD_LIMITS, maxFileBytes: -1 })).toThrow(RangeError);
  });
});

describe("transparency", () => {
  it("a JPEG gets the note (a warning, so the upload goes on)", () => {
    const result = checkLogoFile(makeJpegHeader(1200, 800));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({ code: "transparency", severity: "warning" })]);
    expect(result.issues[0]!.message).toContain("JPEG images cannot be transparent");
    expect(result.issues[0]!.message).toContain("print as a box");
  });

  it("a PNG without an alpha channel gets the note from its header", () => {
    expect(codes(makePng({ width: 64, height: 64, colourType: 2 }))).toEqual(["warning:transparency"]);
  });

  it("decoded pixels decide for a file that can be transparent", () => {
    const w = 40;
    const h = 30;
    const round = analyseTransparency(rgba(w, h, badge(w, h)), w, h);
    expect(round.hasTransparentBackground).toBe(true);
    expect(round.edgeTransparentShare).toBe(1);
    expect(transparencyIssue(round, "image/png")).toBeNull();

    // An RGBA file that is opaque everywhere still prints as a box.
    const opaque = analyseTransparency(rgba(w, h, () => [255, 255, 255, 255]), w, h);
    expect(opaque).toEqual({ transparentShare: 0, edgeTransparentShare: 0, hasTransparentBackground: false });
    expect(transparencyIssue(opaque, "image/png")).toMatchObject({ code: "transparency", severity: "warning" });

    // Transparent inside but a solid frame around it: the background is not transparent.
    const framed = analyseTransparency(rgba(w, h, (x, y) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? [0, 0, 0, 255] : [0, 0, 0, 0])), w, h);
    expect(framed.transparentShare).toBeGreaterThan(0.8);
    expect(framed.hasTransparentBackground).toBe(false);
  });

  it("nearly transparent pixels count as transparent, up to the limit in the data", () => {
    const faint = rgba(4, 4, () => [0, 0, 0, 10]);
    expect(analyseTransparency(faint, 4, 4).hasTransparentBackground).toBe(true);
    expect(analyseTransparency(faint, 4, 4, { ...DEFAULT_UPLOAD_LIMITS, transparentAlphaMax: 5 }).hasTransparentBackground).toBe(false);
  });

  it("works for one-pixel-wide images and refuses pixel data of the wrong length", () => {
    expect(analyseTransparency(rgba(1, 5, () => [0, 0, 0, 0]), 1, 5).edgeTransparentShare).toBe(1);
    expect(() => analyseTransparency(new Uint8ClampedArray(8), 4, 4)).toThrow(RangeError);
  });
});

describe("print resolution (DPI)", () => {
  const logo = (width: number, height: number, box: { width: number; height: number }): Extract<Layer, { kind: "logo" }> => ({
    id: "logo-1",
    kind: "logo",
    role: "crest",
    pieceId: "front",
    position: { x: 100, y: 100 },
    size: box,
    rotation: 0,
    asset: { assetId: "upload-1", mediaType: "image/png", width, height },
  });

  it("is pixels per inch of the printed width", () => {
    expect(printDpi(300, 25.4)).toBe(300);
    expect(printDpi(600, 101.6)).toBe(150);
    expect(maxPrintWidthMm(600, 150)).toBeCloseTo(101.6, 9);
  });

  it("uses the size the logo is drawn at: as large as fits in the box, keeping its proportions", () => {
    expect(logoPrintSize({ width: 100, height: 100 }, 200, 100)).toEqual({ width: 100, height: 50 });
    expect(logoPrintSize({ width: 100, height: 20 }, 200, 100)).toEqual({ width: 40, height: 20 });
    // 200 px across 40 mm: 127 DPI, whatever the box's spare width.
    expect(logoLayerDpi(logo(200, 100, { width: 100, height: 20 }))).toBeCloseTo(127, 9);
  });

  it("warns below the minimum, and the warning goes when the logo is made smaller", () => {
    const small = logo(120, 120, { width: 80, height: 80 }); // 120 px over 80 mm = 38 DPI
    const warnings = logoLayerWarnings(small);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "resolution", severity: "warning" });
    expect(warnings[0]!.message).toBe(
      "At 80 x 80 mm this logo prints at 38 DPI, below the 150 DPI needed for a sharp print. Make it smaller than 20 mm wide, or upload a larger image.",
    );
    const smaller = { ...small, size: { width: 20, height: 20 } }; // 152 DPI
    expect(logoLayerWarnings(smaller)).toEqual([]);
    // Exactly at the minimum is fine.
    expect(logoLayerWarnings(logo(150, 150, { width: 25.4, height: 25.4 }))).toEqual([]);
  });

  it("the minimum is data", () => {
    const layer = logo(600, 600, { width: 100, height: 100 }); // 152 DPI
    expect(logoLayerWarnings(layer)).toEqual([]);
    expect(logoLayerWarnings(layer, { ...DEFAULT_UPLOAD_LIMITS, minDpi: 300 })).toHaveLength(1);
  });

  it("only logo layers have a resolution", () => {
    const textLike = { ...logo(10, 10, { width: 10, height: 10 }), kind: "text" } as unknown as Layer;
    expect(logoLayerWarnings(textLike)).toEqual([]);
  });
});
