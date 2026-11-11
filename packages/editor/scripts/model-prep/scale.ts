/**
 * The true size of UV islands that are not in millimetres: compare edge
 * lengths on the 3D surface with the same edges in UV space. A cloth export
 * lays its flat pattern into UV space at some scale; the garment on the model
 * is that pattern sewn and draped, stretched or eased by a few per cent here
 * and there, but the same cloth. So the median, over an island's edges, of
 * "3D length / UV length" is that island's scale (position units per UV
 * unit), and comparing islands tells whether the layout used one scale for
 * all of them. Plain functions, no files.
 */

/**
 * Median ratio of 3D edge length to UV edge length over the given triangles'
 * edges (each edge of each triangle; a shared edge counts once per triangle).
 * Edges with no UV length (below `minUvLength`) are skipped. Returns NaN when
 * no edge is usable.
 */
export function medianEdgeRatio(
  positions: ArrayLike<number>,
  uvs: ArrayLike<number>,
  indices: ArrayLike<number>,
  triangles: Iterable<number>,
  minUvLength = 1e-9,
): number {
  const ratios: number[] = [];
  for (const t of triangles) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t * 3 + e]!;
      const b = indices[t * 3 + ((e + 1) % 3)]!;
      const uvLength = Math.hypot(uvs[b * 2]! - uvs[a * 2]!, uvs[b * 2 + 1]! - uvs[a * 2 + 1]!);
      if (uvLength < minUvLength) continue;
      const length = Math.hypot(positions[b * 3]! - positions[a * 3]!, positions[b * 3 + 1]! - positions[a * 3 + 1]!, positions[b * 3 + 2]! - positions[a * 3 + 2]!);
      ratios.push(length / uvLength);
    }
  }
  if (ratios.length === 0) return NaN;
  ratios.sort((x, y) => x - y);
  const mid = ratios.length >> 1;
  return ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
}

export interface IslandScale {
  id: string;
  /** Position units per UV unit, from `medianEdgeRatio`. */
  ratio: number;
  /** How much the island counts (its 3D area). */
  weight: number;
}

export interface ScaleDecision {
  /** True when every island that counts is within the tolerance of the common scale: the layout used one scale. */
  oneScale: boolean;
  /** The common scale: the weighted median of the islands' ratios. */
  common: number;
  /** The scale to use per island: the common one when `oneScale`, else the island's own. */
  scales: Map<string, number>;
  /** Each island's ratio relative to the common one, minus 1 (0.02 = 2% larger on the model than in the layout). */
  deviations: Map<string, number>;
  /** The islands that decided (weight at least `minShare` of the total). */
  deciding: string[];
}

/**
 * Decides whether the islands share one UV scale. Islands smaller than
 * `minShare` of the total weight (thin strips, where the drape's stretch
 * dominates) are reported but do not decide. With one scale, every island
 * uses the common one, so the pattern's proportions stay exactly as laid out;
 * otherwise each island uses its own, and the packing step puts them all at
 * one scale in the texture.
 */
export function decideUvScale(islands: readonly IslandScale[], tolerance: number, minShare = 0.01): ScaleDecision {
  if (islands.length === 0) throw new RangeError("no islands to measure");
  for (const i of islands) {
    if (!(i.ratio > 0 && Number.isFinite(i.ratio))) throw new RangeError(`island "${i.id}" has no usable scale (${i.ratio})`);
    if (!(i.weight >= 0)) throw new RangeError(`island "${i.id}" has a negative weight`);
  }
  const total = islands.reduce((n, i) => n + i.weight, 0);
  // Weighted median.
  const sorted = [...islands].sort((a, b) => a.ratio - b.ratio);
  let acc = 0;
  let common = sorted[sorted.length - 1]!.ratio;
  for (const i of sorted) {
    acc += i.weight;
    if (acc >= total / 2) {
      common = i.ratio;
      break;
    }
  }
  const deviations = new Map(islands.map((i) => [i.id, i.ratio / common - 1]));
  const deciding = islands.filter((i) => i.weight >= minShare * total).map((i) => i.id);
  const oneScale = deciding.every((id) => Math.abs(deviations.get(id)!) <= tolerance);
  const scales = new Map(islands.map((i) => [i.id, oneScale ? common : i.ratio]));
  return { oneScale, common, scales, deviations, deciding };
}
