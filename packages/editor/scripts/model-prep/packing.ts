/**
 * Packs pattern pieces into the model's one texture (UV space 0 to 1) at ONE
 * scale for every piece, so a millimetre is the same number of texture pixels
 * on every piece. Each piece gets its bounding box (its `width` x `height` in
 * mm) as a rectangle; rectangles keep the piece's proportions, never overlap,
 * stay `gap` apart and `border` from the texture's edges.
 *
 * Why a gap: the editor draws each piece's colour a little past its box (a
 * bleed of 1/128 of the texture, see texture/pattern-texture.ts) so texture
 * filtering at the model's seams never picks up the background. Two
 * neighbouring pieces need room for both bleeds: a gap of at least 2/128.
 */

export interface PackInput {
  id: string;
  /** Piece size in mm. */
  width: number;
  height: number;
}

export interface UvRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackOptions {
  /** Space between two rectangles, in UV units (1 = the texture's edge). */
  gap: number;
  /** Space between a rectangle and the texture's edge, in UV units. */
  border: number;
  /**
   * How rectangles are placed (default `"shelf"`):
   * - `"shelf"`: tallest first, left to right in rows;
   * - `"skyline"`: tallest first, each where its bottom edge is lowest (then leftmost), so thin strips fill the
   *   room above shorter pieces instead of starting rows of their own;
   * - `"best"`: whichever of the two gives the larger scale (the shelf on a tie).
   */
  method?: "shelf" | "skyline" | "best";
}

export interface PackResult {
  /** UV units per millimetre, the same for every piece. */
  scale: number;
  /** Each piece's rectangle in UV space (glTF convention: origin top-left, V down), by id. */
  rects: Map<string, UvRect>;
}

/** The bleed the texture drawing puts round each piece, in UV units (pattern-texture.ts: size / 128). */
export const TEXTURE_BLEED_UV = 1 / 128;

/** Packing options that leave room for the bleed of both neighbours and at the texture's edge. */
export const DEFAULT_PACK_OPTIONS: PackOptions = { gap: 2 * TEXTURE_BLEED_UV, border: TEXTURE_BLEED_UV };

/**
 * Shelf packing at a given scale: pieces sorted tallest first, placed left to
 * right in rows. Returns null when they do not fit.
 */
function shelfPack(pieces: readonly PackInput[], scale: number, options: PackOptions): Map<string, UvRect> | null {
  const order = [...pieces].sort((a, b) => b.height - a.height || b.width - a.width || (a.id < b.id ? -1 : 1));
  const limit = 1 - options.border;
  const rects = new Map<string, UvRect>();
  let x = options.border;
  let y = options.border;
  let rowHeight = 0;
  for (const piece of order) {
    const w = piece.width * scale;
    const h = piece.height * scale;
    if (x > options.border && x + w > limit) {
      // New row.
      y += rowHeight + options.gap;
      x = options.border;
      rowHeight = 0;
    }
    if (x + w > limit || y + h > limit) return null;
    rects.set(piece.id, { x, y, width: w, height: h });
    x += w + options.gap;
    rowHeight = Math.max(rowHeight, h);
  }
  return rects;
}

/**
 * The largest single scale at which all pieces fit, and where each goes.
 * Throws a `RangeError` for invalid input (no pieces, sizes that are not
 * positive, duplicate ids, or margins that leave no room).
 */
export function packPieces(pieces: readonly PackInput[], options: PackOptions = DEFAULT_PACK_OPTIONS): PackResult {
  if (pieces.length === 0) throw new RangeError("nothing to pack");
  const ids = new Set<string>();
  for (const p of pieces) {
    if (!(p.width > 0 && p.height > 0 && Number.isFinite(p.width) && Number.isFinite(p.height))) {
      throw new RangeError(`piece "${p.id}" has no usable size (${p.width} x ${p.height} mm)`);
    }
    if (ids.has(p.id)) throw new RangeError(`piece id "${p.id}" appears twice`);
    ids.add(p.id);
  }
  if (!(options.gap >= 0 && options.border >= 0) || 2 * options.border >= 1) throw new RangeError("the margins leave no room");
  const method = options.method ?? "shelf";
  const shelf = method === "skyline" ? null : largestScale(pieces, options, shelfPack);
  const skyline = method === "shelf" ? null : largestScale(pieces, options, skylinePack);
  const result = shelf && (!skyline || shelf.scale >= skyline.scale) ? shelf : skyline;
  if (!result) throw new RangeError("the pieces do not fit in the texture");
  return result;
}

/** The largest scale at which `pack` fits the pieces (binary search), rounded down to 9 significant digits, or null. */
function largestScale(
  pieces: readonly PackInput[],
  options: PackOptions,
  pack: (pieces: readonly PackInput[], scale: number, options: PackOptions) => Map<string, UvRect> | null,
): PackResult | null {
  // The scale at which the largest piece alone fills the space is an upper bound; search below it.
  const room = 1 - 2 * options.border;
  let high = Math.min(...pieces.map((p) => room / Math.max(p.width, p.height)));
  let low = 0;
  for (let k = 0; k < 60; k++) {
    const mid = (low + high) / 2;
    if (pack(pieces, mid, options)) low = mid;
    else high = mid;
  }
  // Round the scale down to 9 significant digits, so the numbers written to the product are short and still fit.
  const digits = 9 - Math.ceil(Math.log10(low));
  const scale = Math.floor(low * 10 ** digits) / 10 ** digits;
  const rects = pack(pieces, scale, options);
  return rects ? { scale, rects } : null;
}

/**
 * Skyline packing at a given scale: pieces sorted tallest first; each goes
 * where its bottom edge would be lowest (then leftmost) on the outline of
 * what is placed so far. Returns null when they do not fit.
 */
function skylinePack(pieces: readonly PackInput[], scale: number, options: PackOptions): Map<string, UvRect> | null {
  const order = [...pieces].sort((a, b) => b.height - a.height || b.width - a.width || (a.id < b.id ? -1 : 1));
  // Each rectangle takes its size plus the gap; the limit moves out by the gap to match.
  const limit = 1 - options.border + options.gap;
  let skyline: Array<{ x: number; width: number; y: number }> = [{ x: options.border, width: limit - options.border, y: options.border }];
  const rects = new Map<string, UvRect>();
  for (const piece of order) {
    const w = piece.width * scale;
    const h = piece.height * scale;
    const W = w + options.gap;
    const H = h + options.gap;
    let best: { x: number; y: number } | null = null;
    for (let i = 0; i < skyline.length; i++) {
      const x = skyline[i]!.x;
      if (x + W > limit) break;
      let y = 0;
      for (let j = i; j < skyline.length && skyline[j]!.x < x + W; j++) y = Math.max(y, skyline[j]!.y);
      if (y + H > limit) continue;
      if (!best || y < best.y) best = { x, y };
    }
    if (!best) return null;
    rects.set(piece.id, { x: best.x, y: best.y, width: w, height: h });
    // Raise the skyline under the new rectangle.
    const left = best.x;
    const right = best.x + W;
    const next: typeof skyline = [];
    for (const seg of skyline) {
      const end = seg.x + seg.width;
      if (end <= left || seg.x >= right) next.push(seg);
      else {
        if (seg.x < left) next.push({ x: seg.x, width: left - seg.x, y: seg.y });
        if (end > right) next.push({ x: right, width: end - right, y: seg.y });
      }
    }
    next.push({ x: left, width: W, y: best.y + H });
    next.sort((a, b) => a.x - b.x);
    skyline = next;
  }
  return rects;
}
