/**
 * The plain functions behind the product-pictures page (pictures.tsx): the file names and the framing maths.
 * No browser and no Three.js here, so they are tested (pictures-layout.test.ts).
 */

export type PictureSide = "front" | "back";

/** The garments that get pictures, with the name used in the file names. */
export const PICTURE_GARMENTS = [
  { productId: "match-jersey-vneck", name: "jersey-vneck", template: "classic" },
  { productId: "match-jersey-round", name: "jersey-round", template: "classic" },
  { productId: "stand-in-tshirt", name: "tshirt", template: "band" },
] as const;

export type PictureGarment = (typeof PICTURE_GARMENTS)[number];

/** The picture's edge in pixels, and how much of it the garment fills (its taller side, over the whole set). */
export const PICTURE_SIZE = 1200;
export const PICTURE_FILL = 0.8;
/** The widest the garment may be, as a share of the picture (a wide sleeve must never touch the edge). */
export const PICTURE_MAX_WIDTH = 0.92;
/** The largest a file may be, in bytes. */
export const PICTURE_MAX_BYTES = 200 * 1024;

/** `jersey-vneck-front.webp`. */
export function pictureFileName(garmentName: string, side: PictureSide): string {
  return `${garmentName}-${side}.webp`;
}

/** The pixels of a render that are not transparent: left, top, right and bottom (the right and bottom edges are exclusive). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The box of the pixels whose alpha is above `threshold` in RGBA data, or null when the image is empty. */
export function alphaBox(rgba: ArrayLike<number>, width: number, height: number, threshold = 8): Box | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3]! > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

export interface Placement {
  /** Where the source's top left lands in the picture, and the size the whole source is drawn at. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One scale for the whole set (so a gallery reads as one set with one camera): the garment that is tallest
 * fills `fill` of the picture's height, unless the widest one would then be wider than `maxWidth` of it. Each
 * garment is then centred by its own box. `sources` are the renders' sizes (square renders of one size) with
 * the box of the garment in each.
 */
export function layoutPictures(boxes: readonly Box[], source: number, size = PICTURE_SIZE, fill = PICTURE_FILL, maxWidth = PICTURE_MAX_WIDTH): { scale: number; placements: Placement[] } {
  if (boxes.length === 0) throw new Error("no pictures to lay out");
  const tallest = Math.max(...boxes.map((b) => b.bottom - b.top));
  const widest = Math.max(...boxes.map((b) => b.right - b.left));
  const scale = Math.min((fill * size) / tallest, (maxWidth * size) / widest);
  const placements = boxes.map((b) => {
    const cx = ((b.left + b.right) / 2) * scale;
    const cy = ((b.top + b.bottom) / 2) * scale;
    return { x: size / 2 - cx, y: size / 2 - cy, width: source * scale, height: source * scale };
  });
  return { scale, placements };
}

/** The sizes (in bytes) a WebP encoding is tried at: the quality to start from, going down by `step` until it fits. */
export function* qualitySteps(start = 0.92, step = 0.06, floor = 0.5): Generator<number> {
  for (let q = start; q >= floor - 1e-9; q -= step) yield Math.round(q * 100) / 100;
}
