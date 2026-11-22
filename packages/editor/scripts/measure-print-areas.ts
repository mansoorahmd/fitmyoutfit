// Measures, on the committed models (the stand-ins and the match jersey), the part of each printable piece that is VISIBLE on the model
// (E3c), and prints the print area it suggests. Read-only: it writes nothing; the areas are copied by hand
// into the source records (samples/models/*.source.json, `printAreas`) and the product definitions.
//
// Usage (from packages/editor): npx tsx scripts/measure-print-areas.ts [stand-in-jersey|stand-in-tshirt|match-jersey-vneck|match-jersey-round]
//
// A 5 mm cell of a piece counts as visible when its corners and centre are inside the piece's cut outline
// (so never under a neighbouring piece, such as the jersey's side panels) and the cloth there, its normals
// averaged over 35 mm so the simulated drape's creases do not count, faces the piece's side (the side of
// its presets: front, back, left, right) within 75 degrees, the angle at which the handles turn away. The
// suggested area is the largest upright rectangle of visible cells that is symmetric about the piece's
// centre line (the middle of a print area is the centre line for snapping), lies inside the piece's
// current area, and holds every preset's whole box. Cells are 5 mm, so a suggestion can touch the outline
// at a point (the jersey front's V-neck): the committed jersey front starts 5 mm lower than suggested.

import { NodeIO } from "@gltf-transform/core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isInsidePiece, uvToPiece } from "../src/design/pattern.js";
import type { PatternPiece, ProductDefinition } from "../src/design/schema.js";
import { validateProductDefinition } from "../src/design/validate.js";
import { KHRMeshQuantization } from "./model-prep/quantize.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STEP = 5;
const SMOOTH = 3;
const MAX_ANGLE = 75;
/** The pieces' centre lines (from the source records' `placementsAbout`). */
const CENTRES: Record<string, Record<string, number>> = {
  "stand-in-jersey": { front: 335.5, back: 244, sleeve_left: 186, sleeve_right: 186 },
  "stand-in-tshirt": { front: 260, back: 261, sleeve_left: 209, sleeve_right: 209 },
  "match-jersey-vneck": { front: 235.26, back: 235.26, sleeve_left: 222.44, sleeve_right: 222.44 },
  "match-jersey-round": { front: 235.26, back: 235.26, sleeve_left: 222.44, sleeve_right: 222.44 },
};
const VIEWS: Record<string, [number, number, number]> = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };

type Tri = { p: [number, number][]; n: [number, number, number] };

async function measure(productId: string) {
  const checked = validateProductDefinition(JSON.parse(readFileSync(resolve(root, "samples/products", `${productId}.json`), "utf8")));
  if (!checked.ok) throw new Error(checked.errors.map((e) => e.message).join("\n"));
  const product: ProductDefinition = checked.value;
  const doc = await new NodeIO().registerExtensions([KHRMeshQuantization]).readBinary(readFileSync(resolve(root, "samples", product.model.url.replace(/^\//, ""))));
  const tris = new Map<string, Tri[]>();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const N = prim.getAttribute("NORMAL")!;
      const T = prim.getAttribute("TEXCOORD_0")!;
      const idx = prim.getIndices()!.getArray()!;
      const f = [0, 0];
      const nn = [0, 0, 0];
      const nor: number[][] = [];
      const flat: Array<{ x: number; y: number; piece: PatternPiece | undefined }> = [];
      for (let v = 0; v < T.getCount(); v++) {
        T.getElement(v, f);
        N.getElement(v, nn);
        // The node matrices are rotations and uniform scales: the normal turns with the upper 3 x 3.
        const n = [0, 1, 2].map((r) => m[r]! * nn[0]! + m[4 + r]! * nn[1]! + m[8 + r]! * nn[2]!);
        const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
        nor.push(n.map((c) => c / l));
        const piece = product.pieces.find((p) => f[0]! >= p.uv.x - 1e-4 && f[0]! <= p.uv.x + p.uv.width + 1e-4 && f[1]! >= p.uv.y - 1e-4 && f[1]! <= p.uv.y + p.uv.height + 1e-4);
        const pt = piece ? uvToPiece(piece, { u: f[0]!, v: f[1]! }) : { x: 0, y: 0 };
        flat.push({ x: pt.x, y: pt.y, piece });
      }
      for (let t = 0; t < idx.length; t += 3) {
        const v = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
        const piece = flat[v[0]!]!.piece;
        if (!piece) continue;
        const n = [0, 1, 2].map((k) => (nor[v[0]!]![k]! + nor[v[1]!]![k]! + nor[v[2]!]![k]!) / 3) as [number, number, number];
        const list = tris.get(piece.id) ?? [];
        list.push({ p: v.map((k) => [flat[k]!.x, flat[k]!.y] as [number, number]), n });
        tris.set(piece.id, list);
      }
    }
  }
  // A grid of triangles per piece, for the lookup.
  const CELL = 10;
  const grids = new Map<string, Map<string, Tri[]>>();
  for (const [id, list] of tris) {
    const g = new Map<string, Tri[]>();
    for (const t of list) {
      const xs = t.p.map((q) => q[0]);
      const ys = t.p.map((q) => q[1]);
      for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++) {
        for (let gy = Math.floor(Math.min(...ys) / CELL); gy <= Math.floor(Math.max(...ys) / CELL); gy++) {
          const k = `${gx},${gy}`;
          const cell = g.get(k);
          if (cell) cell.push(t);
          else g.set(k, [t]);
        }
      }
    }
    grids.set(id, g);
  }
  const normalAt = (pieceId: string, x: number, y: number): [number, number, number] | null => {
    for (const { p, n } of grids.get(pieceId)?.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const [A, B, C] = p as [[number, number], [number, number], [number, number]];
      const det = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1])) / det;
      const l2 = ((B[0] - A[0]) * (y - A[1]) - (x - A[0]) * (B[1] - A[1])) / det;
      if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) return n;
    }
    return null;
  };

  const result: Record<string, unknown> = {};
  for (const piece of product.pieces) {
    if (!piece.printArea) continue;
    const presets = product.placements.filter((p) => p.pieceId === piece.id);
    const dir = VIEWS[presets[0]?.side ?? "front"]!;
    const cols = Math.floor(piece.width / STEP);
    const rows = Math.floor(piece.height / STEP);
    const normals: Array<Array<[number, number, number] | null>> = [];
    const inside: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      normals.push([]);
      inside.push([]);
      for (let c = 0; c < cols; c++) {
        const pts = [[c, r], [c + 1, r], [c, r + 1], [c + 1, r + 1], [c + 0.5, r + 0.5]].map(([a, b]) => ({ x: a! * STEP, y: b! * STEP }));
        inside[r]!.push(pts.every((pt) => isInsidePiece(piece, pt) && normalAt(piece.id, pt.x, pt.y) !== null));
        normals[r]!.push(normalAt(piece.id, (c + 0.5) * STEP, (r + 0.5) * STEP));
      }
    }
    const visible = (x: number, y: number) => {
      const c = Math.floor(x / STEP);
      const r = Math.floor(y / STEP);
      if (r < 0 || c < 0 || r >= rows || c >= cols || !inside[r]![c]) return false;
      const sum = [0, 0, 0];
      for (let i = -SMOOTH; i <= SMOOTH; i++) {
        for (let j = -SMOOTH; j <= SMOOTH; j++) {
          const n = normals[r + i]?.[c + j];
          if (n) for (let k = 0; k < 3; k++) sum[k]! += n[k]!;
        }
      }
      const l = Math.hypot(sum[0]!, sum[1]!, sum[2]!) || 1;
      return (sum[0]! * dir[0] + sum[1]! * dir[1] + sum[2]! * dir[2]) / l >= Math.cos((MAX_ANGLE * Math.PI) / 180);
    };
    const cx = CENTRES[productId]?.[piece.id] ?? piece.width / 2;
    const now = piece.printArea;
    const maxHalf = Math.floor(Math.min(cx - now.x, now.x + now.width - cx));
    const halfAt: number[] = [];
    for (let y = 0; y <= Math.ceil(piece.height); y++) {
      let h = 0;
      while (h < maxHalf && visible(cx - h - 1, y) && visible(cx + h + 1, y)) h++;
      halfAt.push(visible(cx, y) ? h : -1);
    }
    const top = Math.min(...presets.map((p) => p.centre.y - p.maxSize.height / 2));
    const bottom = Math.max(...presets.map((p) => p.centre.y + p.maxSize.height / 2));
    let best: { x: number; y: number; width: number; height: number } | null = null;
    for (let y0 = Math.ceil(now.y); y0 <= top; y0++) {
      let h = Infinity;
      for (let y1 = y0 + 1; y1 <= Math.floor(now.y + now.height); y1++) {
        h = Math.min(h, halfAt[y1 - 1] ?? -1);
        if (h <= 0) break;
        if (y1 < bottom || (y1 - y0) % 5 !== 0) continue;
        if (!best || 2 * h * (y1 - y0) > best.width * best.height) best = { x: cx - h, y: y0, width: 2 * h, height: y1 - y0 };
      }
    }
    result[piece.id] = { now, suggested: best };
  }
  return result;
}

const ids = process.argv.slice(2);
for (const id of ids.length > 0 ? ids : Object.keys(CENTRES)) console.log(id, JSON.stringify(await measure(id), null, 1));
