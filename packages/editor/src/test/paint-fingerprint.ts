/**
 * A fingerprint of what `drawPatternTexture` paints for a design: the SHA-256
 * of every pixel of a software raster (see raster-context.ts), and of the text
 * calls (string, font, alignment, direction, colour, transform). Used to show
 * that a design painted by one version of the code paints the same picture in
 * another (src/test/fixtures/v2-sample-paint.json was recorded by the E2 code,
 * format version 2, before format version 3 existed).
 */
import { createHash } from "node:crypto";
import type { DesignDocument, ProductDefinition } from "../design/schema";
import { drawPatternTexture } from "../texture/pattern-texture";
import { RasterContext, fakeImage, type TextCall } from "./raster-context";

export const FINGERPRINT_SIZE = 384;

export interface PaintFingerprint {
  /** SHA-256 of the texture's pixels (texture mode). */
  texture: string;
  /** SHA-256 of the flat view's pixels. */
  flat: string;
  /** SHA-256 of the text calls, in order. */
  text: string;
  /** Pixels that are not the background, as a sanity number. */
  painted: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function paintFingerprint(product: ProductDefinition, design: DesignDocument): PaintFingerprint {
  const images = (asset: { assetId: string }) => fakeImage(asset.assetId);
  const texture = new RasterContext(FINGERPRINT_SIZE, FINGERPRINT_SIZE);
  drawPatternTexture(texture, product, design, { size: FINGERPRINT_SIZE, images });
  const flat = new RasterContext(FINGERPRINT_SIZE, FINGERPRINT_SIZE);
  drawPatternTexture(flat, product, design, { size: FINGERPRINT_SIZE, mode: "flat", images });
  const text = texture.calls
    .filter((c): c is TextCall => c.op === "fillText")
    .map((c) => JSON.stringify([c.text, c.font, c.textAlign, c.textBaseline, c.direction, c.style, c.matrix.map((m) => m.toFixed(6)), c.x.toFixed(6), c.y.toFixed(6)]))
    .join("\n");
  return {
    texture: hash(texture.pixels.join("|")),
    flat: hash(flat.pixels.join("|")),
    text: hash(text),
    painted: texture.pixels.filter((p) => p !== "" && p !== "#7F7F7F").length,
  };
}
