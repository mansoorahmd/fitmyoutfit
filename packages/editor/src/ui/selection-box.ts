/**
 * How the selected item's box is drawn on the screen (E3d, 07-editor-review 4.5; R31 to R35). Plain maths on
 * screen points, tested without a browser:
 *
 * - four straight lines between the four projected corners, never a polyline along the cloth (R31);
 * - outset 8 px in screen space, each edge moved out, so the handles never sit on the item (R32);
 * - at least 44 x 44 px, grown about the item's centre when the item is smaller (R32, R34);
 * - the turn handle on a stem from the middle of the top edge, long enough that its 44 px hit circle never
 *   overlaps a corner's; moved below the box (or to its end side) when it would touch another item or the top
 *   row (R33);
 * - guides drawn only outside the box, with a 4 px gap (R35).
 */
import type { Pt } from "./handles.js";

export const BOX_OUTSET = 8;
export const MIN_BOX = 44;
export const TURN_STEM_MIN = 24;
/** Half a handle's hit area (44 px). */
const HIT = 22;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

/** Twice the signed area (screen y down: positive for clockwise on screen). */
function signedArea2(q: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) s += cross(q[i]!, q[(i + 1) % q.length]!);
  return s;
}

export function centroid(q: readonly Pt[]): Pt {
  return { x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length };
}

/** The axis-aligned box round some points. */
export function boundsOf(points: readonly Pt[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The quad with every edge moved `d` px outwards (its corners where the moved edges meet). A quad seen almost
 * edge-on (no area) falls back to its bounding box grown by `d`.
 */
export function outsetQuad(q: readonly Pt[], d: number): Pt[] {
  const area = signedArea2(q);
  if (Math.abs(area) < 1) {
    const b = boundsOf(q);
    return [
      { x: b.x - d, y: b.y - d },
      { x: b.x + b.width + d, y: b.y - d },
      { x: b.x + b.width + d, y: b.y + b.height + d },
      { x: b.x - d, y: b.y + b.height + d },
    ];
  }
  const sign = area > 0 ? 1 : -1;
  const n = q.length;
  // Each edge's outward normal (screen y down: for a clockwise quad the outward normal of a->b is (dy, -dx)).
  const lines = q.map((a, i) => {
    const b = q[(i + 1) % n]!;
    const dir = unit(sub(b, a));
    const normal = { x: dir.y * sign, y: -dir.x * sign };
    return { p: add(a, mul(normal, d)), dir, normal };
  });
  return q.map((corner, i) => {
    const l1 = lines[(i - 1 + n) % n]!;
    const l2 = lines[i]!;
    const denom = cross(l1.dir, l2.dir);
    if (Math.abs(denom) < 1e-6) return add(corner, mul(unit(add(l1.normal, l2.normal)), d));
    const t = cross(sub(l2.p, l1.p), l2.dir) / denom;
    const at = add(l1.p, mul(l1.dir, t));
    // A very sharp corner would shoot far out: keep it within 3 d of the corner.
    return len(sub(at, corner)) > 3 * d ? add(corner, mul(unit(sub(at, corner)), 3 * d)) : at;
  });
}

/**
 * The quad grown about `centre` so each of its two directions (top edge, side edge) spans at least `min` px.
 * Corners are written in the quad's own axes (it may be turned), scaled where too short, and written back.
 */
export function ensureMinBox(q: readonly Pt[], centre: Pt, min: number): Pt[] {
  const u = unit(add(sub(q[1]!, q[0]!), sub(q[2]!, q[3]!)));
  const v = unit(add(sub(q[3]!, q[0]!), sub(q[2]!, q[1]!)));
  const det = cross(u, v);
  if (Math.abs(det) < 1e-3) {
    const half = min / 2;
    return [
      { x: centre.x - half, y: centre.y - half },
      { x: centre.x + half, y: centre.y - half },
      { x: centre.x + half, y: centre.y + half },
      { x: centre.x - half, y: centre.y + half },
    ];
  }
  const coords = q.map((p) => {
    const r = sub(p, centre);
    return { a: cross(r, v) / det, b: cross(u, r) / det };
  });
  const spanA = Math.max(...coords.map((c) => c.a)) - Math.min(...coords.map((c) => c.a));
  const spanB = Math.max(...coords.map((c) => c.b)) - Math.min(...coords.map((c) => c.b));
  const scale = (span: number) => (span >= min ? 1 : span > 1e-6 ? min / span : 0);
  const ka = scale(spanA);
  const kb = scale(spanB);
  return coords.map((c) => {
    const a = ka === 0 ? (c.a >= 0 ? min / 2 : -min / 2) : c.a * ka;
    const b = kb === 0 ? (c.b >= 0 ? min / 2 : -min / 2) : c.b * kb;
    return add(centre, add(mul(u, a), mul(v, b)));
  });
}

function circleHitsRect(c: Pt, r: number, rect: Rect): boolean {
  const dx = Math.max(rect.x - c.x, 0, c.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - c.y, 0, c.y - (rect.y + rect.height));
  return dx * dx + dy * dy < r * r;
}

/** The square hit area of a corner handle. */
export function cornerHit(c: Pt): Rect {
  return { x: c.x - HIT, y: c.y - HIT, width: 2 * HIT, height: 2 * HIT };
}

export type TurnPlace = "top" | "bottom" | "end";

export interface SelectionFrame {
  /** The drawn box: four corners, clockwise from the item's top left. */
  corners: Pt[];
  /** Where the stem starts (an edge's middle) and the turn handle. */
  stemFrom: Pt;
  turn: Pt;
  turnPlace: TurnPlace;
}

/**
 * The drawn box and the turn handle for an item whose projected corners (clockwise from its top left) and
 * centre are given. `obstacles`: other items' boxes and the top row, which the turn handle's hit circle must not
 * touch. `endIsRight`: the end side for the turn handle's last place (left-to-right: the right).
 */
export function selectionFrame(itemCorners: readonly Pt[], centre: Pt, obstacles: readonly Rect[] = [], options: { outset?: number; min?: number } = {}): SelectionFrame {
  const out = outsetQuad(itemCorners, options.outset ?? BOX_OUTSET);
  const corners = ensureMinBox(out, centre, options.min ?? MIN_BOX);
  const mid = centroid(corners);
  const edge = (i: number) => {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    return { a, b, m: mul(add(a, b), 0.5) };
  };
  const candidate = (i: number, place: TurnPlace) => {
    const { a, b, m } = edge(i);
    // Out of the box, perpendicular to the edge, away from the box's middle.
    const along = unit(sub(b, a));
    let normal = { x: along.y, y: -along.x };
    if ((m.x - mid.x) * normal.x + (m.y - mid.y) * normal.y < 0) normal = mul(normal, -1);
    // Long enough that the hit circle clears both corners' hit squares (never overlapping handles, R34).
    let stem = TURN_STEM_MIN;
    for (; stem < 80; stem += 2) {
      const t = add(m, mul(normal, stem));
      if (!circleHitsRect(t, HIT, cornerHit(a)) && !circleHitsRect(t, HIT, cornerHit(b))) break;
    }
    const turn = add(m, mul(normal, stem));
    const blocked = obstacles.filter((r) => circleHitsRect(turn, HIT, r)).length;
    return { stemFrom: m, turn, turnPlace: place, blocked };
  };
  const options3 = [candidate(0, "top"), candidate(2, "bottom"), candidate(1, "end")];
  const chosen = options3.find((c) => c.blocked === 0) ?? options3[0]!;
  return { corners, stemFrom: chosen.stemFrom, turn: chosen.turn, turnPlace: chosen.turnPlace };
}

/** Whether a point lies inside a convex quad grown by `gap` px. */
export function insideQuad(p: Pt, q: readonly Pt[], gap = 0): boolean {
  const sign = signedArea2(q) >= 0 ? 1 : -1;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const dir = unit(sub(b, a));
    // Signed distance outwards from the edge.
    const out = cross(dir, sub(p, a)) * -sign;
    if (out > gap) return false;
  }
  return true;
}

/** Guide runs with the parts inside the box (grown by `gap`) taken out (R35): the coach reads what they place. */
export function clipRunsOutside(runs: readonly (readonly Pt[])[], q: readonly Pt[], gap = 4, step = 3): Pt[][] {
  const out: Pt[][] = [];
  for (const run of runs) {
    let current: Pt[] = [];
    const flush = () => {
      if (current.length > 1) out.push(current);
      current = [];
    };
    for (let i = 0; i < run.length; i++) {
      const a = run[i]!;
      const b = run[i + 1];
      const pieces = b ? Math.max(1, Math.ceil(len(sub(b, a)) / step)) : 1;
      for (let k = 0; k < pieces; k++) {
        const p = b ? add(a, mul(sub(b, a), k / pieces)) : a;
        if (insideQuad(p, q, gap)) flush();
        else current.push(p);
      }
    }
    flush();
  }
  return out;
}
