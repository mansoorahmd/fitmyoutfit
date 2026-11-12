/**
 * Small pictures of the garment as the 3D model shows it, without WebGL: the
 * template cards (06-editor.md 4.1, N13) and any other preview that must look
 * like a jersey or a T-shirt, not like a flat pattern piece.
 *
 * Why: a flat front piece is not what a coach recognises. The stand-in
 * jersey's front wraps round under the side panels, so drawn flat it is wide
 * at the hem and has no sleeves, and the cards read like a dress (E3a-1).
 *
 * How (cheap enough for a phone, and the same everywhere):
 * 1. `renderGarmentView` rasterises the model's triangles ONCE per product
 *    and side, in software, seen straight from the front (or the back) with
 *    an orthographic camera, into a small buffer: for every sample, the
 *    model's UV there, how much light falls on it (the studio's key light,
 *    the baked occlusion), and whether it is the outside or the inside of
 *    the cloth. About 100,000 triangles at 240 x 300 samples: tens of
 *    milliseconds on a desktop, once.
 * 2. `composeGarmentView` then makes a card for any design by looking up the
 *    design's pattern texture (drawn small by `drawPatternTexture`) at those
 *    UVs: one lookup per sample, a millisecond or two per card.
 *
 * Plain maths over typed arrays: no Three.js, no DOM. The geometry comes from
 * the loaded model (react/garment-geometry.ts) or, in tests, from the GLB file.
 */

/** One mesh of the garment, in world space (any unit; Y up, the front facing +Z). */
export interface GarmentMesh {
  /** x, y, z per vertex. */
  positions: ArrayLike<number>;
  /** u, v per vertex (glTF: V down), the pattern texture's coordinates. */
  uvs: ArrayLike<number>;
  /** x, y, z per vertex, world space, or null to use each triangle's own normal. */
  normals?: ArrayLike<number> | null;
  /** Two values per vertex (outside, inside: 0 closed to 1 open), the model's baked occlusion, if it has one. */
  occlusion?: ArrayLike<number> | null;
  /** Three per triangle; null for a non-indexed mesh. */
  indices?: ArrayLike<number> | null;
}

export type GarmentViewSide = "front" | "back";

export interface GarmentViewOptions {
  /** The picture's size in pixels. */
  width: number;
  height: number;
  side?: GarmentViewSide;
  /** Space kept round the garment, as a share of the smaller side. Default 0.04. */
  padding?: number;
  /** Samples per pixel along each axis (2: four per pixel, for smooth edges). Default 2. */
  supersample?: number;
}

/** What `renderGarmentView` records per sample. */
export interface GarmentView {
  width: number;
  height: number;
  supersample: number;
  side: GarmentViewSide;
  /** Per sample: 0 nothing (the background), 1 the outside of the cloth, 2 the inside (seen through an opening). */
  kind: Uint8Array;
  u: Float32Array;
  v: Float32Array;
  /** Brightness, 0 to about 1.2. */
  light: Float32Array;
}

/** How the view is lit: a soft key light from above right of the camera, as the 3D view's studio (react/studio.ts). */
const KEY = normalise([0.9, 1.1, 1]);
const AMBIENT = 0.58;
const DIFFUSE = 0.5;
/** Occlusion as the 3D view shades it (react/fabric.ts DEFAULT_FABRIC_SHADING). */
const OUTSIDE_FLOOR = 0.42;
const INSIDE_FLOOR = 0.45;
const INSIDE_OPEN = 0.85;
/** The inside of a garment, seen through the neck, is in shade. */
const INSIDE_SHADE = 0.55;

function normalise(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Rasterises the garment seen straight from the front (or the back) into a
 * view buffer, fitted into `width` x `height` (keeping its proportions,
 * centred). Nearest surface wins (a depth buffer).
 */
export function renderGarmentView(meshes: readonly GarmentMesh[], options: GarmentViewOptions): GarmentView {
  const ss = Math.max(1, Math.round(options.supersample ?? 2));
  const side = options.side ?? "front";
  const W = Math.max(1, Math.round(options.width)) * ss;
  const H = Math.max(1, Math.round(options.height)) * ss;
  const n = W * H;
  const kind = new Uint8Array(n);
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const light = new Float32Array(n);
  const depth = new Float32Array(n).fill(-Infinity);
  const flip = side === "back" ? -1 : 1;

  // The garment's bounds as seen: screen x = X (mirrored from the back), screen y = -Y.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of meshes) {
    const p = mesh.positions;
    for (let k = 0; k + 2 < p.length; k += 3) {
      const x = flip * p[k]!;
      const y = -p[k + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const view: GarmentView = { width: W / ss, height: H / ss, supersample: ss, side, kind, u, v, light };
  if (!(maxX > minX && maxY > minY)) return view;
  const pad = (options.padding ?? 0.04) * Math.min(W, H);
  const scale = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (H - (maxY - minY) * scale) / 2 - minY * scale;

  for (const mesh of meshes) {
    const P = mesh.positions;
    const T = mesh.uvs;
    const N = mesh.normals ?? null;
    const O = mesh.occlusion ?? null;
    const count = mesh.indices ? mesh.indices.length : P.length / 3;
    const index = (k: number) => (mesh.indices ? mesh.indices[k]! : k);
    for (let t = 0; t + 2 < count; t += 3) {
      const a = index(t);
      const b = index(t + 1);
      const c = index(t + 2);
      const ax = flip * P[a * 3]! * scale + offX;
      const ay = -P[a * 3 + 1]! * scale + offY;
      const bx = flip * P[b * 3]! * scale + offX;
      const by = -P[b * 3 + 1]! * scale + offY;
      const cx = flip * P[c * 3]! * scale + offX;
      const cy = -P[c * 3 + 1]! * scale + offY;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      if (x0 > x1 || y0 > y1) continue;
      const az = flip * P[a * 3 + 2]!;
      const bz = flip * P[b * 3 + 2]!;
      const cz = flip * P[c * 3 + 2]!;
      // The triangle's own normal, towards the viewer when its z is positive (used without vertex normals).
      let fnx = 0;
      let fny = 0;
      let fnz = 0;
      if (!N) {
        const e1 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
        const e2 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
        [fnx, fny, fnz] = normalise([e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]);
      }
      const inv = 1 / area;
      for (let py = y0; py <= y1; py++) {
        const sy = py + 0.5;
        for (let px = x0; px <= x1; px++) {
          const sx = px + 0.5;
          const w0 = ((bx - sx) * (cy - sy) - (cx - sx) * (by - sy)) * inv;
          const w1 = ((cx - sx) * (ay - sy) - (ax - sx) * (cy - sy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * az + w1 * bz + w2 * cz;
          const at = py * W + px;
          if (z <= depth[at]!) continue;
          depth[at] = z;
          u[at] = w0 * T[a * 2]! + w1 * T[b * 2]! + w2 * T[c * 2]!;
          v[at] = w0 * T[a * 2 + 1]! + w1 * T[b * 2 + 1]! + w2 * T[c * 2 + 1]!;
          let nx = fnx;
          let ny = fny;
          let nz = fnz;
          if (N) {
            nx = w0 * N[a * 3]! + w1 * N[b * 3]! + w2 * N[c * 3]!;
            ny = w0 * N[a * 3 + 1]! + w1 * N[b * 3 + 1]! + w2 * N[c * 3 + 1]!;
            nz = w0 * N[a * 3 + 2]! + w1 * N[b * 3 + 2]! + w2 * N[c * 3 + 2]!;
          }
          // In the camera's frame: x right, y up, z towards the viewer.
          const cxn = flip * nx;
          const czn = flip * nz;
          const len = Math.hypot(cxn, ny, czn) || 1;
          const inside = czn < 0;
          const openOut = O ? w0 * O[a * 2]! + w1 * O[b * 2]! + w2 * O[c * 2]! : 1;
          const openIn = O ? w0 * O[a * 2 + 1]! + w1 * O[b * 2 + 1]! + w2 * O[c * 2 + 1]! : 1;
          if (inside) {
            kind[at] = 2;
            light[at] = INSIDE_SHADE * (INSIDE_FLOOR + (INSIDE_OPEN - INSIDE_FLOOR) * openIn);
          } else {
            kind[at] = 1;
            const diffuse = Math.max(0, (cxn * KEY[0] + ny * KEY[1] + czn * KEY[2]) / len);
            light[at] = (AMBIENT + DIFFUSE * diffuse) * (OUTSIDE_FLOOR + (1 - OUTSIDE_FLOOR) * openOut);
          }
        }
      }
    }
  }
  return view;
}

/** The pattern texture's colour at a UV point, as 0xRRGGBB. */
export type TextureSampler = (u: number, v: number) => number;

/** A sampler over RGBA pixels (an ImageData's `data`), nearest pixel, clamped to the edge. */
export function samplerFromRgba(data: ArrayLike<number>, width: number, height: number): TextureSampler {
  return (u, v) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
    const k = (y * width + x) * 4;
    return ((data[k]! & 255) << 16) | ((data[k + 1]! & 255) << 8) | (data[k + 2]! & 255);
  };
}

/**
 * Paints a design onto a view buffer: for every pixel of the picture, the
 * average of its samples (the texture at the sample's UV, times its light),
 * and as alpha the share of samples that hit the garment. Writes RGBA (not
 * premultiplied, as ImageData wants) into `out`, `width * height * 4` long.
 */
export function composeGarmentView(view: GarmentView, sample: TextureSampler, out: Uint8ClampedArray): void {
  const { width, height, supersample: ss, kind, u, v, light } = view;
  const W = width * ss;
  const per = ss * ss;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let j = 0; j < ss; j++) {
        const row = (y * ss + j) * W + x * ss;
        for (let i = 0; i < ss; i++) {
          const at = row + i;
          if (kind[at] === 0) continue;
          const colour = sample(u[at]!, v[at]!);
          const l = light[at]!;
          r += ((colour >> 16) & 255) * l;
          g += ((colour >> 8) & 255) * l;
          b += (colour & 255) * l;
          hits++;
        }
      }
      const o = (y * width + x) * 4;
      if (hits === 0) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 0;
        continue;
      }
      out[o] = r / hits;
      out[o + 1] = g / hits;
      out[o + 2] = b / hits;
      out[o + 3] = (255 * hits) / per;
    }
  }
}

/** The garment's outline in the picture, per row: the first and last pixel it covers (or null), for tests and the loading silhouette. */
export function garmentRows(view: GarmentView): Array<{ from: number; to: number } | null> {
  const { width, height, supersample: ss, kind } = view;
  const W = width * ss;
  const rows: Array<{ from: number; to: number } | null> = [];
  for (let y = 0; y < height; y++) {
    let from = -1;
    let to = -1;
    for (let x = 0; x < width; x++) {
      let covered = false;
      for (let j = 0; j < ss && !covered; j++) for (let i = 0; i < ss && !covered; i++) covered = kind[(y * ss + j) * W + x * ss + i] !== 0;
      if (covered) {
        if (from < 0) from = x;
        to = x;
      }
    }
    rows.push(from < 0 ? null : { from, to });
  }
  return rows;
}
