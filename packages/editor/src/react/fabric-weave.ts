/**
 * G3: the cloth's micro-structure, as small tiling normal maps made by code (no image files).
 *
 * A modern football jersey is a smooth polyester knit: from a normal distance it is an even surface with a soft
 * sheen, and only up close does its fine structure show. Two structures, at about their real scale:
 *
 * - `interlock` (the body): the fine double knit of match jerseys, columns of tiny stitch loops, a column 1.25 mm
 *   wide; very shallow.
 * - `mesh` (side panels, by data: a piece's `surface`): a fine pinhole mesh, small round eyelets in staggered rows,
 *   2.5 mm apart.
 *
 * One tile is `MICRO_TILE_MM` of cloth (the models' UVs are true millimetres of the pattern). 32 x 32 texels, 4 KB,
 * with mipmaps. It shows only at the closest zooms (`microAmount`, by CSS pixels per millimetre, so a phone shows
 * what a desktop shows), and the shader fades it out by itself where a tile is only a few device pixels wide, so
 * nothing shimmers or crawls when the garment turns. E3g's 12 mm knit (bigger than a stitch on purpose, so it read
 * at the closest zoom) read as a sweater; this replaces it.
 *
 * Pure maths, no Three.js, so it is tested without a GPU.
 */

/** The micro-structures a piece's cloth can have. */
export type MicroSurface = "interlock" | "mesh";

/** Texels along a tile's side. */
export const MICRO_SIZE = 32;
/** The cloth a tile covers, in millimetres: two interlock columns and rows, or two eyelets of the mesh. */
export const MICRO_TILE_MM = 2.5;

/** Distance from a point to a segment. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const smooth = (h: number) => h * h * (3 - 2 * h);

/**
 * The height (0 to 1, 0.5 the cloth's plane for the mesh) of the structure at a point of the tile (`u`, `v` in 0 to
 * 1; wraps). The interlock: in each of 2 x 2 cells a stitch, two short legs leaning in to a point below, low and
 * rounded. The mesh: a flat face with two round eyelets, at (0.25, 0.25) and (0.75, 0.75), a little rounded at
 * their rims.
 */
export function microHeight(surface: MicroSurface, u: number, v: number): number {
  if (surface === "mesh") {
    let depth = 0;
    for (const [hx, hy] of [[0.25, 0.25], [0.75, 0.75]] as const) {
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const d = Math.hypot(u - (hx + i), v - (hy + j));
          // An eyelet 0.9 mm across (0.36 of the 2.5 mm tile), its rim rounded over 0.3 mm.
          const h = Math.max(0, Math.min(1, (0.3 - d) / 0.12));
          depth = Math.max(depth, smooth(h));
        }
      }
    }
    return 0.5 - 0.5 * depth;
  }
  const fx = u * 2;
  const fy = v * 2;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  let best = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const x = fx - (cx + i);
      const y = fy - (cy + j);
      for (const side of [-1, 1]) {
        const d = distanceToSegment(x, y, 0.5, 0.85, 0.5 + side * 0.26, 0.15);
        best = Math.max(best, smooth(Math.max(0, 1 - d / 0.3)));
      }
    }
  }
  return best;
}

/**
 * The tile as RGBA bytes: a tangent-space normal map (flat is 128, 128, 255). `strength`: how steep the relief is;
 * low on purpose (shallow: the structure is faint even where it shows fully).
 */
export function makeMicroNormals(surface: MicroSurface, size = MICRO_SIZE, strength = surface === "mesh" ? 1.1 : 0.7): Uint8Array {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) height[y * size + x] = microHeight(surface, (x + 0.5) / size, (y + 0.5) / size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -((at(x + 1, y) - at(x - 1, y)) * 0.5) * strength * (size / 8);
      const ny = -((at(x, y + 1) - at(x, y - 1)) * 0.5) * strength * (size / 8);
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** The model files are in metres: this many units to the millimetre. */
const UNITS_PER_MM = 0.001;
/**
 * The structure is absent while a millimetre of cloth is under `MICRO_OFF_PX_PER_MM` CSS pixels on the screen, and
 * complete from `MICRO_FULL_PX_PER_MM`: off at the resting view and at a mid zoom, in at the closest zooms (on the
 * match jersey 1.9 to 2.9 CSS px per mm at the closest zoom, phone to desktop; 0.6 to 0.9 at rest).
 */
export const MICRO_OFF_PX_PER_MM = 1.35;
export const MICRO_FULL_PX_PER_MM = 1.8;

/** How many CSS pixels one millimetre of cloth facing the camera covers, `distance` away in a view `cssHeight` high. */
export function cssPxPerMm(distance: number, fovDegrees: number, cssHeight: number): number {
  const seen = 2 * Math.max(1e-6, distance) * Math.tan((fovDegrees * Math.PI) / 360);
  return (UNITS_PER_MM * cssHeight) / seen;
}

/**
 * How much of the micro-structure shows (0 to 1). It depends on the zoom in CSS pixels, never on device pixels (a
 * phone at two or three pixels to the pixel shows what a desktop shows), and it is one number for the whole garment
 * (no patch where one part of the cloth is nearer than another): smooth at rest and at a mid zoom, the structure
 * coming in smoothly towards the closest zoom.
 */
export function microAmount(pxPerMm: number): number {
  const t = Math.max(0, Math.min(1, (pxPerMm - MICRO_OFF_PX_PER_MM) / (MICRO_FULL_PX_PER_MM - MICRO_OFF_PX_PER_MM)));
  return t * t * (3 - 2 * t);
}
