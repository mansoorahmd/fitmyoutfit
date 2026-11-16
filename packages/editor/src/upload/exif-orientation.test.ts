/**
 * Phone photos (E3c, B5): a JPEG with an EXIF Orientation tag (Android and
 * iPhone cameras write one) is accepted, at the size it is seen at (upright),
 * so its proportions on the kit, its sharpness and the saved reference are
 * right. QA12 had an 800 x 400 photo with Orientation 6 refused as "damaged".
 */
import { describe, expect, it } from "vitest";
import { exifOrientation, readImageHeader, uprightSize } from "../design/image-file";
import { checkLogoFile } from "../design/upload-checks";
import { makeJpegHeader } from "../test/images";
import { createMemoryAssetStore } from "./memory-store";
import { uploadLogo, type PixelDecoder } from "./logo-upload";

const jpeg = (bytes: Uint8Array) => new File([bytes as BlobPart], "photo.jpg", { type: "image/jpeg" });
/** A decoder that opens the picture at a given size (the browser applies the orientation; some decoders do not). */
const opensAs =
  (width: number, height: number): PixelDecoder =>
  async () => ({ rgba: new Uint8ClampedArray(4 * 4).fill(255), width: 2, height: 2, naturalWidth: width, naturalHeight: height });

describe("EXIF orientation (B5)", () => {
  for (const littleEndian of [false, true]) {
    it(`reads orientations 1 to 8 from the EXIF block (${littleEndian ? "Intel" : "Motorola"} order)`, () => {
      for (let o = 1; o <= 8; o++) {
        const result = readImageHeader(makeJpegHeader(800, 400, 0xc0, o, littleEndian));
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.header).toMatchObject({ width: 800, height: 400 });
        expect(result.header.orientation).toBe(o === 1 ? undefined : o);
        expect(uprightSize(result.header)).toEqual(o >= 5 ? { width: 400, height: 800 } : { width: 800, height: 400 });
      }
    });
  }

  it("ignores what is not an EXIF block, and never throws on a cut one", () => {
    expect(exifOrientation(new Uint8Array([1, 2, 3]))).toBeNull();
    const full = makeJpegHeader(800, 400, 0xc0, 6);
    // Cut anywhere inside the EXIF block: still a header (orientation unknown or read), never an exception.
    for (let cut = 30; cut < 90; cut++) expect(() => readImageHeader(full.subarray(0, cut))).not.toThrow();
    expect(readImageHeader(makeJpegHeader(800, 400)).ok && (readImageHeader(makeJpegHeader(800, 400)) as { header: { orientation?: number } }).header.orientation).toBeUndefined();
    expect(checkLogoFile(full).ok).toBe(true);
  });

  for (let o = 1; o <= 8; o++) {
    it(`accepts an 800 x 400 photo with orientation ${o}, at the size it is seen (whether the decoder turns it or not)`, async () => {
      const upright = o >= 5 ? { width: 400, height: 800 } : { width: 800, height: 400 };
      for (const decoder of [opensAs(upright.width, upright.height), opensAs(800, 400)]) {
        const store = createMemoryAssetStore("t");
        const result = await uploadLogo(jpeg(makeJpegHeader(800, 400, 0xc0, o)), { upload: store.upload, decode: decoder });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.asset).toMatchObject({ mediaType: "image/jpeg", ...upright });
        // The saved copy is the original file (never re-encoded) with the upright size beside it.
        if (result.ok) expect(store.get(result.asset.assetId)).toMatchObject(upright);
        store.dispose();
      }
    });
  }

  it("still refuses a file that opens at another size altogether (damaged)", async () => {
    const store = createMemoryAssetStore("t");
    const result = await uploadLogo(jpeg(makeJpegHeader(800, 400, 0xc0, 6)), { upload: store.upload, decode: opensAs(300, 300) });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "damaged" }] });
    store.dispose();
  });
});
