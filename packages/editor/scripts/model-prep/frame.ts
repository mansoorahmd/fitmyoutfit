/**
 * Turning a piece's source UVs (millimetres of the flat pattern, any
 * orientation, any origin) into the editor's piece coordinates: millimetres
 * from the piece's top-left corner, X to the right and Y down as seen from the
 * garment's outside, the piece's top towards the neck or shoulder.
 *
 * Only mirroring and a half turn are applied, never a scale, so a millimetre
 * stays a millimetre.
 */
import type { PathPoint } from "../../src/design/svg-path.js";

export interface PieceFrame {
  /** Mirror the source U (the source pattern is seen from the inside). */
  mirror: boolean;
  /** Turn the piece half round (the source pattern is upside down). */
  halfTurn: boolean;
}

/**
 * Decides the frame from the mesh. `indices` must wind counter-clockwise seen
 * from the garment's outside; `heights` is each vertex's height on the
 * garment (+Y up). Source UVs are read with V down, as glTF does.
 *
 * - Mirror: seen from outside with X right and Y down, a counter-clockwise
 *   triangle must stay counter-clockwise on the flat piece, which with Y down
 *   means a negative shoelace sum. A positive one means the source is mirrored.
 * - Half turn: down the piece (+Y) must go down the garment, so piece Y and
 *   garment height must be negatively correlated.
 */
export function pieceFrame(uvs: ArrayLike<number>, heights: ArrayLike<number>, indices: ArrayLike<number>): PieceFrame {
  let shoelace = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;
    shoelace += (uvs[b * 2]! - uvs[a * 2]!) * (uvs[c * 2 + 1]! - uvs[a * 2 + 1]!) - (uvs[b * 2 + 1]! - uvs[a * 2 + 1]!) * (uvs[c * 2]! - uvs[a * 2]!);
  }
  const mirror = shoelace > 0;
  const n = heights.length;
  let mv = 0;
  let mh = 0;
  for (let k = 0; k < n; k++) {
    mv += uvs[k * 2 + 1]!;
    mh += heights[k]!;
  }
  mv /= n;
  mh /= n;
  let cov = 0;
  for (let k = 0; k < n; k++) cov += (uvs[k * 2 + 1]! - mv) * (heights[k]! - mh);
  return { mirror, halfTurn: cov > 0 };
}

/** A source UV point (mm) in the frame, before moving the origin to the top-left corner. */
export function applyFrame(frame: PieceFrame, u: number, v: number): PathPoint {
  let x = frame.mirror ? -u : u;
  let y = v;
  if (frame.halfTurn) {
    x = -x;
    y = -y;
  }
  return { x, y };
}
