/**
 * E3g: the fine knit of sports polyester, as a small tiling normal map made by code (no image file).
 *
 * One tile is a few stitches of plain knit: columns of "V" shapes, each V two leaning legs. The tile is
 * `WEAVE_TILE_MM` of cloth wide, bigger than a real stitch on purpose (a real one is under a millimetre,
 * which would be less than a pixel at the closest zoom). 64 x 64 texels, 16 KB, with mipmaps: seen from far
 * the mip chain and the shader's fade (fabric.ts) make it vanish into an even surface, so nothing shimmers.
 * Pure maths, no Three.js, so it is tested without a GPU.
 */

/** Texels along a tile's side. */
export const WEAVE_SIZE = 64;
/** The cloth a tile covers, in millimetres (the models' UVs are in true millimetres of the pattern). */
export const WEAVE_TILE_MM = 12;
/** Stitch columns and rows in one tile. */
const COLUMNS = 3;
const ROWS = 3;

/** Distance from a point to a segment. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The height (0 to 1) of the knit at a point of the tile (`u`, `v` in 0 to 1; wraps). */
export function weaveHeight(u: number, v: number): number {
  const fx = u * COLUMNS;
  const fy = v * ROWS;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  let best = 0;
  // The stitch's own cell and its neighbours, so legs that run over a cell's edge are seamless (and the tile wraps).
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const x = fx - (cx + i);
      const y = fy - (cy + j);
      // A V: its point low in the middle, its two legs leaning up and out.
      for (const side of [-1, 1]) {
        const d = distanceToSegment(x, y, 0.5, 0.12, 0.5 + side * 0.34, 0.98);
        const h = Math.max(0, 1 - d / 0.24);
        const soft = h * h * (3 - 2 * h);
        if (soft > best) best = soft;
      }
    }
  }
  return best;
}

/** The tile as RGBA bytes: a tangent-space normal map (flat is 128, 128, 255). `strength`: slope of the steepest part. */
export function makeWeaveNormals(size = WEAVE_SIZE, strength = 2.2): Uint8Array {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) height[y * size + x] = weaveHeight((x + 0.5) / size, (y + 0.5) / size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Slopes per tile side, from the wrapped neighbours.
      const nx = -((at(x + 1, y) - at(x - 1, y)) * 0.5) * strength * (size / 16);
      const ny = -((at(x, y + 1) - at(x, y - 1)) * 0.5) * strength * (size / 16);
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
