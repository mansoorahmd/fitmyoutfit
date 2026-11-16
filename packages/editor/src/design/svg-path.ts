/**
 * A small, dependency-free reader for SVG path data (the `d` attribute), used
 * for the vector shapes of pattern pieces: their outline and their colour-zone
 * regions. Plain functions, no DOM: the validator, the texture drawing, the
 * zone lookup and the model generator all read a path through this one parser,
 * so what is validated, what is drawn and what is hit-tested are the same shape.
 *
 * Supported commands, absolute and relative: M, L, H, V, C, Q, Z. Arcs (A) and
 * the smooth shorthands (S, T) are refused with a readable message rather than
 * guessed at; a pattern exported from CAD can be written with these commands
 * (arcs as cubic curves). Coordinates are millimetres in the piece's own space.
 */

export interface PathPoint {
  x: number;
  y: number;
}

/** One drawing command, in absolute coordinates. */
export type PathCommand =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Q"; x1: number; y1: number; x: number; y: number }
  | { type: "Z" };

export type ParsePathResult = { ok: true; commands: PathCommand[] } | { ok: false; error: string };

/** The longest path data accepted, in characters. A full pattern piece needs far less. */
export const MAX_PATH_LENGTH = 20_000;

/** What a path's characters may be, as a regular expression (also used by the JSON Schema). */
export const SVG_PATH_PATTERN = "^[MmLlHhVvCcQqZz0-9eE.,+\\-\\s]+$";

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const ARGUMENTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };

/** Parses SVG path data into absolute commands. Never throws. */
export function parseSvgPath(d: unknown): ParsePathResult {
  if (typeof d !== "string") return { ok: false, error: "path data must be a string" };
  if (d.length > MAX_PATH_LENGTH) return { ok: false, error: `path data is longer than ${MAX_PATH_LENGTH} characters` };

  const commands: PathCommand[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let current: string | null = null;
  let open = false; // a subpath is started (after M)

  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const readNumber = (): number | null => {
    skip();
    const match = NUMBER.exec(d.slice(i, i + 64));
    if (!match) return null;
    i += match[0].length;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  };

  skip();
  if (i >= d.length) return { ok: false, error: "path data is empty" };
  while (true) {
    skip();
    if (i >= d.length) break;
    const ch = d[i]!;
    if (/[A-Za-z]/.test(ch)) {
      const upper = ch.toUpperCase();
      if (!(upper in ARGUMENTS)) {
        return { ok: false, error: `command '${ch}' at character ${i} is not supported (use M, L, H, V, C, Q and Z)` };
      }
      current = ch;
      i++;
    } else if (current === null) {
      return { ok: false, error: `path data must start with a move command (M), found '${ch}'` };
    } else if (current === "Z" || current === "z") {
      return { ok: false, error: `unexpected '${ch}' at character ${i} after a close command (Z)` };
    }
    if (current === null) return { ok: false, error: "path data must start with a move command (M)" };
    const upper = current.toUpperCase();
    // Every subpath starts with M: at the start, and again after a Z. (SVG would
    // start an implicit subpath after Z; requiring M keeps every reader of the
    // path, including the canvas, in agreement.)
    if (!open && upper !== "M") {
      return {
        ok: false,
        error:
          commands.length === 0
            ? `path data must start with a move command (M), found '${current}'`
            : `command '${current}' at character ${i - 1} follows a close (Z); start the next shape with a move (M)`,
      };
    }

    const relative: boolean = current !== upper;
    const count = ARGUMENTS[upper]!;
    const args: number[] = [];
    for (let k = 0; k < count; k++) {
      const value = readNumber();
      if (value === null) {
        return { ok: false, error: `command '${current}' near character ${i} needs ${count} numbers` };
      }
      args.push(value);
    }
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (upper) {
      case "M":
        x = ox + args[0]!;
        y = oy + args[1]!;
        startX = x;
        startY = y;
        commands.push({ type: "M", x, y });
        open = true;
        // Further coordinate pairs after a move are line-tos (SVG rule).
        current = relative ? "l" : "L";
        break;
      case "L":
        x = ox + args[0]!;
        y = oy + args[1]!;
        commands.push({ type: "L", x, y });
        break;
      case "H":
        x = ox + args[0]!;
        commands.push({ type: "L", x, y });
        break;
      case "V":
        y = oy + args[0]!;
        commands.push({ type: "L", x, y });
        break;
      case "C": {
        const c = {
          type: "C" as const,
          x1: ox + args[0]!,
          y1: oy + args[1]!,
          x2: ox + args[2]!,
          y2: oy + args[3]!,
          x: ox + args[4]!,
          y: oy + args[5]!,
        };
        commands.push(c);
        x = c.x;
        y = c.y;
        break;
      }
      case "Q": {
        const q = { type: "Q" as const, x1: ox + args[0]!, y1: oy + args[1]!, x: ox + args[2]!, y: oy + args[3]! };
        commands.push(q);
        x = q.x;
        y = q.y;
        break;
      }
      case "Z":
        commands.push({ type: "Z" });
        open = false;
        x = startX;
        y = startY;
        break;
    }
  }
  return { ok: true, commands };
}

/** Like `parseSvgPath`, but throws a `RangeError` for invalid path data. */
export function parseSvgPathOrThrow(d: string): PathCommand[] {
  const result = parseSvgPath(d);
  if (!result.ok) throw new RangeError(`Invalid path data: ${result.error}`);
  return result.commands;
}

/** A flattened subpath: straight segments through `points`. */
export interface Polyline {
  points: PathPoint[];
  /** True when the subpath ends with Z. Filling treats every subpath as closed either way. */
  closed: boolean;
}

/** Straight segments per curve when flattening. Fixed, so results are reproducible. */
export const CURVE_SEGMENTS = 24;

/** Turns commands into polylines (curves become `CURVE_SEGMENTS` straight segments each). */
export function flattenPath(commands: readonly PathCommand[], segments = CURVE_SEGMENTS): Polyline[] {
  const out: Polyline[] = [];
  let current: Polyline | null = null;
  let x = 0;
  let y = 0;
  for (const c of commands) {
    if (c.type === "M") {
      current = { points: [{ x: c.x, y: c.y }], closed: false };
      out.push(current);
      x = c.x;
      y = c.y;
      continue;
    }
    if (!current) continue;
    if (c.type === "L") {
      current.points.push({ x: c.x, y: c.y });
      x = c.x;
      y = c.y;
    } else if (c.type === "C") {
      for (let k = 1; k <= segments; k++) {
        const t = k / segments;
        const m = 1 - t;
        current.points.push({
          x: m * m * m * x + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t * t * t * c.x,
          y: m * m * m * y + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t * t * t * c.y,
        });
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "Q") {
      for (let k = 1; k <= segments; k++) {
        const t = k / segments;
        const m = 1 - t;
        current.points.push({
          x: m * m * x + 2 * m * t * c.x1 + t * t * c.x,
          y: m * m * y + 2 * m * t * c.y1 + t * t * c.y,
        });
      }
      x = c.x;
      y = c.y;
    } else {
      current.closed = true;
      const first = current.points[0]!;
      x = first.x;
      y = first.y;
      current = null;
    }
  }
  return out;
}

/**
 * True when the point is inside the filled shape, with the non-zero winding
 * rule (the default fill rule of SVG and of the 2D canvas). Every subpath
 * counts as closed, as when it is filled.
 */
/** Each closed polyline's bounds, worked out once: a point outside them is never inside it (E3c, S1: readability samples). */
const lineBoundsCache = new WeakMap<Polyline, { x0: number; y0: number; x1: number; y1: number }>();
function boundsOf(line: Polyline) {
  let b = lineBoundsCache.get(line);
  if (!b) {
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const q of line.points) {
      b.x0 = Math.min(b.x0, q.x);
      b.y0 = Math.min(b.y0, q.y);
      b.x1 = Math.max(b.x1, q.x);
      b.y1 = Math.max(b.y1, q.y);
    }
    lineBoundsCache.set(line, b);
  }
  return b;
}

export function pointInPolylines(polylines: readonly Polyline[], p: PathPoint): boolean {
  let winding = 0;
  for (const line of polylines) {
    // A closed line winds round no point outside its bounds.
    const b = boundsOf(line);
    if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
    const pts = line.points;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[(k + 1) % pts.length]!;
      if (a.y <= p.y) {
        if (b.y > p.y && cross(a, b, p) > 0) winding++;
      } else if (b.y <= p.y && cross(a, b, p) < 0) {
        winding--;
      }
    }
  }
  return winding !== 0;
}

function cross(a: PathPoint, b: PathPoint, p: PathPoint): number {
  return (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
}

/** Shortest distance from a point to the edges of the shape (every subpath closed). */
export function distanceToPolylines(polylines: readonly Polyline[], p: PathPoint): number {
  let best = Infinity;
  for (const line of polylines) {
    const pts = line.points;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[(k + 1) % pts.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
  }
  return best;
}

/** Bounding box of the flattened shape, or null when it has no points. */
export function polylineBounds(
  polylines: readonly Polyline[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of polylines) {
    for (const p of line.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function segmentsCross(a: PathPoint, b: PathPoint, c: PathPoint, d: PathPoint): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * True when two filled shapes share some area: a point of one lies inside the
 * other, or their edges cross. Shapes that only touch along an edge do not count.
 */
export function shapesOverlap(a: readonly Polyline[], b: readonly Polyline[]): boolean {
  const boxA = polylineBounds(a);
  const boxB = polylineBounds(b);
  if (!boxA || !boxB) return false;
  if (boxA.maxX <= boxB.minX || boxB.maxX <= boxA.minX || boxA.maxY <= boxB.minY || boxB.maxY <= boxA.minY) return false;
  if (a.some((line) => line.points.some((p) => pointInPolylines(b, p)))) return true;
  if (b.some((line) => line.points.some((p) => pointInPolylines(a, p)))) return true;
  for (const la of a) {
    for (let i = 0; i < la.points.length; i++) {
      const p = la.points[i]!;
      const q = la.points[(i + 1) % la.points.length]!;
      for (const lb of b) {
        for (let k = 0; k < lb.points.length; k++) {
          if (segmentsCross(p, q, lb.points[k]!, lb.points[(k + 1) % lb.points.length]!)) return true;
        }
      }
    }
  }
  return false;
}

/** The drawing calls a path needs. A CanvasRenderingContext2D or a Path2D has them all. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
  closePath(): void;
}

/** Replays parsed commands onto a canvas context or Path2D, in the context's current transform. */
export function traceSvgPath(sink: PathSink, commands: readonly PathCommand[]): void {
  for (const c of commands) {
    switch (c.type) {
      case "M":
        sink.moveTo(c.x, c.y);
        break;
      case "L":
        sink.lineTo(c.x, c.y);
        break;
      case "C":
        sink.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        break;
      case "Q":
        sink.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
        break;
      case "Z":
        sink.closePath();
        break;
    }
  }
}
