import { describe, expect, it, vi } from "vitest";
import { uploadLogo, type DecodedPixels, type PixelDecoder } from "./logo-upload";
import { createMemoryAssetStore } from "./memory-store";
import { createDesign } from "../design/create";
import { addLayer, updateLayer } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
import { scaleLayer } from "../design/placement";
import { DEFAULT_UPLOAD_LIMITS, logoLayerDpi, logoLayerWarnings } from "../design/upload-checks";
import { validateDesign } from "../design/validate";
import { loadPlaceholderProduct } from "../test/fixtures";
import { decodeTestPng, makeJpegHeader, makePng } from "../test/images";

const product = loadPlaceholderProduct();

/** The test stand-in for the browser decoder: decodes our own PNGs, refuses anything else. */
const decode: PixelDecoder = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { rgba, width, height } = decodeTestPng(bytes);
  return { rgba, width, height, naturalWidth: width, naturalHeight: height } satisfies DecodedPixels;
};

const file = (bytes: Uint8Array, name: string, type = "image/png") => new File([bytes as BlobPart], name, { type });

describe("uploadLogo", () => {
  it("checks, uploads with the host's function and returns only a reference", async () => {
    const store = createMemoryAssetStore("test");
    const upload = vi.fn(store.upload);
    const png = makePng({ width: 600, height: 300 });
    const result = await uploadLogo(file(png, "badge.png"), { upload, decode });
    expect(result).toEqual({
      ok: true,
      asset: { assetId: expect.stringMatching(/^test-/), mediaType: "image/png", width: 600, height: 300 },
      issues: [],
    });
    expect(upload).toHaveBeenCalledTimes(1);
    // The host got the original bytes, unchanged.
    const stored = store.get(result.ok ? result.asset.assetId : "")!;
    expect(stored.bytes).toEqual(png);
    expect(stored).toMatchObject({ mediaType: "image/png", width: 600, height: 300, fileName: "badge.png" });
    store.dispose();
  });

  it("the design JSON holds no image data after the logo is added: only the reference", async () => {
    const store = createMemoryAssetStore("test");
    const png = makePng({ width: 600, height: 600 });
    const result = await uploadLogo(file(png, "logo.png"), { upload: store.upload, decode });
    if (!result.ok) throw new Error("upload refused");
    const design = addLayer(createDesign(product), newLogoLayer(product, { id: "logo-1", pieceId: "front", asset: result.asset }), { product });
    expect(validateDesign(design, { product }).ok).toBe(true);
    const json = JSON.stringify(design);
    const layer = design.layers[0]!;
    expect(layer.kind === "logo" && Object.keys(layer.asset).sort()).toEqual(["assetId", "height", "mediaType", "width"]);
    expect(json).not.toMatch(/data:|base64|blob:/);
    expect(json).not.toContain(Buffer.from(png.subarray(0, 24)).toString("base64").slice(0, 16));
    expect(json.length).toBeLessThan(2000);
    expect(png.length).toBeGreaterThan(json.length);
    store.dispose();
  });

  it("refuses a text file renamed to .png, and never calls the upload", async () => {
    const upload = vi.fn();
    const result = await uploadLogo(file(new TextEncoder().encode("not an image at all\n"), "logo.png"), { upload, decode });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "file-type", severity: "error" }] });
    expect(result.issues[0]!.message).toContain("a text file");
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses an oversized file without reading it", async () => {
    const upload = vi.fn();
    const big = file(makePng({ width: 64, height: 64 }), "big.png");
    Object.defineProperty(big, "size", { value: DEFAULT_UPLOAD_LIMITS.maxFileBytes + 1 });
    const read = vi.spyOn(big, "arrayBuffer");
    const result = await uploadLogo(big, { upload, decode });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "file-size", severity: "error" }] });
    expect(read).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("an opaque logo uploads, with the transparency note", async () => {
    const store = createMemoryAssetStore();
    const opaque = makePng({ width: 300, height: 300, pixel: () => [255, 255, 255, 255] }); // RGBA file, no transparent pixel
    const result = await uploadLogo(file(opaque, "white-box.png"), { upload: store.upload, decode });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({ code: "transparency", severity: "warning" })]);
    const jpeg = await uploadLogo(file(makeJpegHeader(800, 600), "photo.jpg", "image/jpeg"), { upload: store.upload, decode: null });
    expect(jpeg).toMatchObject({ ok: true, issues: [{ code: "transparency", severity: "warning" }] });
    store.dispose();
  });

  it("refuses a file the decoder cannot open, or that opens at another size than its header says", async () => {
    const upload = vi.fn();
    const broken: PixelDecoder = async () => {
      throw new Error("decode failed");
    };
    expect(await uploadLogo(file(makePng({ width: 64, height: 64 }), "a.png"), { upload, decode: broken })).toMatchObject({ ok: false, issues: [{ code: "damaged" }] });
    const liar: PixelDecoder = async (blob, header) => ({ ...(await decode(blob, header)), naturalWidth: 1 });
    const result = await uploadLogo(file(makePng({ width: 64, height: 64 }), "a.png"), { upload, decode: liar });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "damaged" }] });
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a failed upload and an unusable id from the host", async () => {
    const png = file(makePng({ width: 64, height: 64 }), "a.png");
    expect(await uploadLogo(png, { upload: async () => Promise.reject(new Error("offline")), decode })).toMatchObject({
      ok: false,
      issues: [{ message: "The upload failed: offline" }],
    });
    expect(await uploadLogo(png, { upload: async () => ({ assetId: "has spaces" }), decode })).toMatchObject({ ok: false });
  });
});

describe("a small logo stretched large gets the DPI warning, and loses it when made smaller", () => {
  it("is placed sharp, warned when enlarged, and fine again when reduced", () => {
    const asset = { assetId: "small", mediaType: "image/png" as const, width: 120, height: 120 };
    const placed = newLogoLayer(product, { id: "logo-1", pieceId: "front", asset });
    // 120 px at 150 DPI is 20.32 mm.
    expect(placed.size.width).toBeCloseTo(20.32, 2);
    expect(logoLayerDpi(placed)).toBeGreaterThanOrEqual(150);
    expect(logoLayerWarnings(placed)).toEqual([]);

    let design = addLayer(createDesign(product), placed, { product });
    design = updateLayer(design, "logo-1", scaleLayer(design.layers[0]!, 4), { product });
    expect(logoLayerWarnings(design.layers[0]!)).toEqual([expect.objectContaining({ code: "resolution", severity: "warning" })]);
    design = updateLayer(design, "logo-1", scaleLayer(design.layers[0]!, 0.25), { product });
    expect(logoLayerWarnings(design.layers[0]!)).toEqual([]);
  });

  // Found in the demo: 200 px at its sharp width (33.8667 mm) was stored as 33.867 mm, 149.9993 DPI, and warned.
  it("a logo placed at exactly its sharp size is not warned because of rounding, even after resizing back and forth", () => {
    const asset = { assetId: "small", mediaType: "image/png" as const, width: 200, height: 200 };
    let layer = newLogoLayer(product, { id: "logo-1", pieceId: "front", asset });
    expect(logoLayerWarnings(layer)).toEqual([]);
    for (let k = 0; k < 4; k++) layer = { ...layer, ...scaleLayer(layer, 1.25) };
    expect(logoLayerWarnings(layer)[0]!.message).toContain("prints at 61 DPI");
    for (let k = 0; k < 4; k++) layer = { ...layer, ...scaleLayer(layer, 1 / 1.25) };
    expect(logoLayerWarnings(layer)).toEqual([]);
  });
});
