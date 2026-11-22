import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO, type Document } from "@gltf-transform/core";
import { beforeAll, describe, expect, it } from "vitest";
import { RasterContext } from "./raster-context";
import { isInsidePiece, pieceGeometry, pieceToUv, uvToPiece, zoneAtUv } from "../design/pattern";
import { pieceAtMeshUv } from "../design/placement";
import { createDesign } from "../design/create";
import { validateProductDefinition } from "../design/validate";
import { distanceToPolylines, type PathPoint } from "../design/svg-path";
import type { PatternPiece, ProductDefinition } from "../design/schema";
import { DEFAULT_TEXTURE_SIZE, drawPatternTexture, pieceTextureRect, pieceTextureScale } from "../texture/pattern-texture";
import { KHRMeshQuantization } from "../../scripts/model-prep/quantize";
import { TriangleGrid, sideHitRates } from "../../scripts/model-prep/mesh3d";

// Our own match jersey (G3): samples/models/match-jersey-<neck>.glb and samples/products/match-jersey-<neck>.json,
// written by scripts/process-stand-in-model.ts from the Style3D export (see match-jersey-<neck>.source.json). These
// tests check that the two files describe the same garment, that a millimetre on a piece is a true millimetre in the
// texture and on the model, that the seams are closed and no cloth lies on other cloth, and that the file is fit
// for a phone.

const root = resolve(import.meta.dirname, "../..");

interface Neck {
  id: string;
  triangles: number;
  /** Texture pixels per mm at 2048, the same on every piece. */
  scale: number;
  front: { width: number; height: number };
}

const NECKS: Neck[] = [
  { id: "match-jersey-vneck", triangles: 40_385, scale: 1.839, front: { width: 470.53, height: 645.73 } },
  { id: "match-jersey-round", triangles: 40_322, scale: 1.839, front: { width: 470.54, height: 645.74 } },
];

const PIECES = ["front", "back", "sleeve_left", "sleeve_right", "side_panel_left", "side_panel_right", "collar", "cuff_left", "cuff_right"];

describe.each(NECKS)("$id", (neck) => {
  const productJson = JSON.parse(readFileSync(resolve(root, "samples/products", `${neck.id}.json`), "utf8")) as unknown;
  const checked = validateProductDefinition(productJson);
  if (!checked.ok) throw new Error(checked.errors.map((e) => e.message).join("\n"));
  const product: ProductDefinition = checked.value;
  const glbPath = resolve(root, "samples/models", `${neck.id}.glb`);
  const record = JSON.parse(readFileSync(resolve(root, "samples/models", `${neck.id}.source.json`), "utf8")) as {
    source: { sha256: string; bytes: number };
    pieces: Array<{ id: string; zone: string }>;
    output: { keepPosition?: boolean };
  };
  const piece = (id: string) => product.pieces.find((p) => p.id === id)!;

  let doc: Document;
  /** Per piece (one mesh each): world positions (metres), normals, UVs, occlusion and triangles, decoded from the integers. */
  const meshes = new Map<string, { pos: Float64Array; nrm: Float64Array; uvs: Float64Array; occ: Float64Array; idx: Uint16Array }>();

  beforeAll(async () => {
    doc = await new NodeIO().registerExtensions([KHRMeshQuantization]).readBinary(readFileSync(glbPath));
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const prim = mesh.listPrimitives()[0]!;
      const m = node.getWorldMatrix();
      const count = prim.getAttribute("POSITION")!.getCount();
      const data = { pos: new Float64Array(count * 3), nrm: new Float64Array(count * 3), uvs: new Float64Array(count * 2), occ: new Float64Array(count * 2), idx: prim.getIndices()!.getArray() as Uint16Array };
      const e = [0, 0, 0];
      const f = [0, 0];
      for (let v = 0; v < count; v++) {
        prim.getAttribute("POSITION")!.getElement(v, e);
        for (let a = 0; a < 3; a++) data.pos[v * 3 + a] = m[a]! * e[0]! + m[4 + a]! * e[1]! + m[8 + a]! * e[2]! + m[12 + a]!;
        prim.getAttribute("NORMAL")!.getElement(v, e);
        data.nrm.set(e, v * 3);
        prim.getAttribute("TEXCOORD_0")!.getElement(v, f);
        data.uvs.set(f, v * 2);
        prim.getAttribute("_OCCLUSION")!.getElement(v, f);
        data.occ.set(f, v * 2);
      }
      meshes.set(mesh.getName(), data);
    }
  });

  const distanceMm = (a: number[], b: number[]) => 1000 * Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  /** The point on the 3D garment (metres) that shows a point of a piece (mm): found through the UVs. */
  function onGarment(p: PatternPiece, point: PathPoint): [number, number, number] {
    const { pos, uvs, idx } = meshes.get(p.mesh)!;
    const flat = (v: number) => uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! });
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      const [A, B, C] = [flat(a), flat(b), flat(c)];
      const det = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
      const l1 = ((point.x - A.x) * (C.y - A.y) - (C.x - A.x) * (point.y - A.y)) / det;
      const l2 = ((B.x - A.x) * (point.y - A.y) - (point.x - A.x) * (B.y - A.y)) / det;
      const l0 = 1 - l1 - l2;
      if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) return [0, 1, 2].map((k) => l0 * pos[a * 3 + k]! + l1 * pos[b * 3 + k]! + l2 * pos[c * 3 + k]!) as [number, number, number];
    }
    throw new Error(`(${point.x}, ${point.y}) mm is not on the "${p.id}" piece of the model`);
  }

  /** Length along the cloth (mm) of a straight line on a piece, in 20 steps. */
  function alongCloth(p: PatternPiece, from: PathPoint, to: PathPoint): number {
    let length = 0;
    let previous = onGarment(p, from);
    for (let s = 1; s <= 20; s++) {
      const next = onGarment(p, { x: from.x + ((to.x - from.x) * s) / 20, y: from.y + ((to.y - from.y) * s) / 20 });
      length += distanceMm(previous, next);
      previous = next;
    }
    return length;
  }

  const centroid = (id: string) => {
    const { pos } = meshes.get(id)!;
    const c = [0, 0, 0];
    const n = pos.length / 3;
    for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) c[k]! += pos[v * 3 + k]! / n;
    return c;
  };

  describe("the file", () => {
    it("is small enough for a phone: under 2 MB", () => {
      const size = statSync(glbPath).size;
      expect(size).toBeLessThan(2_000_000);
      expect(size).toBeGreaterThan(500_000); // a much smaller file would have lost geometry
    });

    it("keeps every triangle of the source's nine pieces, one mesh per piece, named as the piece", () => {
      const names = doc.getRoot().listMeshes().map((m) => m.getName()).sort();
      expect(names).toEqual([...PIECES].sort());
      for (const p of product.pieces) expect(p.mesh).toBe(p.id);
      let triangles = 0;
      for (const m of meshes.values()) triangles += m.idx.length / 3;
      expect(triangles).toBe(neck.triangles);
    });

    it("uses 16-bit indices and integer vertex data (KHR_mesh_quantization), and only the data the editor uses", () => {
      for (const mesh of doc.getRoot().listMeshes()) {
        const prim = mesh.listPrimitives()[0]!;
        expect(mesh.listPrimitives()).toHaveLength(1);
        expect(prim.getIndices()!.getComponentType()).toBe(5123);
        expect(prim.listSemantics().sort()).toEqual(["NORMAL", "POSITION", "TEXCOORD_0", "_OCCLUSION"]);
        expect(prim.getAttribute("POSITION")!.getComponentType()).toBe(5122);
        expect(prim.getAttribute("NORMAL")!.getComponentType()).toBe(5120);
      }
      expect(doc.getRoot().listExtensionsRequired().map((e) => e.extensionName)).toEqual(["KHR_mesh_quantization"]);
    });

    it("holds no textures and one plain material: the colours come from the design, drawn at run time", () => {
      expect(doc.getRoot().listTextures()).toEqual([]);
      const materials = doc.getRoot().listMaterials();
      expect(materials).toHaveLength(1);
      expect(materials[0]!.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
      expect(materials[0]!.getDoubleSided()).toBe(true);
    });

    it("says where it comes from: our own pattern, the source file's SHA-256 recorded", () => {
      expect(doc.getRoot().getAsset().copyright).toContain("FitMyOutfit match jersey");
      expect(record.source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(product.model.url).toBe(`/models/${neck.id}.glb`);
      expect(product.id).toBe(neck.id);
    });
  });

  describe("geometry", () => {
    it("keeps the avatar's frame (metres, Y up): the hem at the hips, the collar at the neck, the front at +Z, the wearer's left at +X", () => {
      expect(record.output.keepPosition).toBe(true);
      let minY = Infinity;
      let maxY = -Infinity;
      for (const { pos } of meshes.values()) {
        for (let v = 0; v < pos.length; v += 3) {
          minY = Math.min(minY, pos[v + 1]!);
          maxY = Math.max(maxY, pos[v + 1]!);
        }
      }
      expect(minY).toBeGreaterThan(0.9);
      expect(minY).toBeLessThan(1.0);
      expect(maxY).toBeGreaterThan(1.5);
      expect(maxY).toBeLessThan(1.62);
      expect(centroid("front")[2]).toBeGreaterThan(centroid("back")[2]!);
      expect(centroid("sleeve_left")[0]).toBeGreaterThan(0.15);
      expect(centroid("sleeve_right")[0]).toBeLessThan(-0.15);
      expect(centroid("side_panel_left")[0]).toBeGreaterThan(0.1);
      expect(centroid("collar")[1]).toBeGreaterThan(1.45);
    });

    it("winds every triangle counter-clockwise seen from outside, and its normals agree", () => {
      for (const [id, { pos, nrm, idx }] of meshes) {
        let agree = 0;
        for (let t = 0; t < idx.length; t += 3) {
          const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
          const e1 = [0, 1, 2].map((k) => pos[b * 3 + k]! - pos[a * 3 + k]!);
          const e2 = [0, 1, 2].map((k) => pos[c * 3 + k]! - pos[a * 3 + k]!);
          const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
          const n = [0, 1, 2].map((k) => nrm[a * 3 + k]! + nrm[b * 3 + k]! + nrm[c * 3 + k]!);
          if (face[0]! * n[0]! + face[1]! * n[1]! + face[2]! * n[2]! > 0) agree++;
        }
        expect(agree / (idx.length / 3), id).toBeGreaterThan(0.995);
      }
      let z = 0;
      for (let v = 0; v < meshes.get("front")!.nrm.length; v += 3) z += meshes.get("front")!.nrm[v + 2]!;
      expect(z).toBeGreaterThan(0);
    });

    it("has closed seams: edge vertices of two pieces that meet are at exactly the same place, every seam sewn", () => {
      const all: Array<{ id: string; p: number[] }> = [];
      for (const [id, { pos }] of meshes) for (let v = 0; v < pos.length; v += 3) all.push({ id, p: [pos[v]!, pos[v + 1]!, pos[v + 2]!] });
      const grid = new Map<string, number[]>();
      const cell = (p: number[]) => p.map((x) => Math.floor(x / 0.002));
      all.forEach((a, k) => {
        const key = cell(a.p).join(",");
        const list = grid.get(key);
        if (list) list.push(k);
        else grid.set(key, [k]);
      });
      let seamVertices = 0;
      let open = 0;
      const pairs = new Set<string>();
      all.forEach((a) => {
        const c = cell(a.p);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++)
              for (const w of grid.get(`${c[0]! + dx},${c[1]! + dy},${c[2]! + dz}`) ?? []) {
                const b = all[w]!;
                if (b.id === a.id) continue;
                const d = distanceMm(a.p, b.p);
                if (d < 1) {
                  seamVertices++;
                  pairs.add([a.id, b.id].sort().join(" / "));
                  if (d > 1e-6) open++;
                }
              }
      });
      expect(seamVertices).toBeGreaterThan(1000);
      expect(open).toBe(0);
      for (const pair of [
        "back / front", // the shoulders
        "front / side_panel_left",
        "front / side_panel_right",
        "back / side_panel_left",
        "back / side_panel_right",
        "front / sleeve_left",
        "back / sleeve_left",
        "side_panel_left / sleeve_left",
        "cuff_left / sleeve_left",
        "cuff_right / sleeve_right",
        "collar / front",
        "back / collar",
      ]) {
        expect(pairs, pair).toContain(pair);
      }
    });

    it("lays no surface on another: within 0.2 mm of any piece there is no other cloth (no flicker)", () => {
      const list = [...meshes.values()].map((m) => ({ positions: m.pos, indices: Uint32Array.from(m.idx) }));
      const grid = new TriangleGrid(list, 0.015);
      list.forEach((m, k) => {
        const r = sideHitRates(grid, k, m, { samples: 120, maxDistance: 0.0002, offset: 0.00001, seed: 900 + k });
        expect(r.front + r.back, [...meshes.keys()][k]).toBeLessThanOrEqual(0.02);
      });
    });

    it("bakes occlusion for both sides: the inside darker than the outside", () => {
      for (const [id, { occ }] of meshes) {
        let outer = 0;
        let inner = 0;
        for (let v = 0; v < occ.length; v += 2) {
          outer += occ[v]!;
          inner += occ[v + 1]!;
        }
        expect(inner, id).toBeLessThan(outer);
      }
    });
  });

  describe("pieces, UVs and millimetres", () => {
    it(`traces the front at ${neck.front.width} x ${neck.front.height} mm, as the pattern (470 x 645 mm) is drawn`, () => {
      expect(piece("front").width).toBeCloseTo(neck.front.width, 1);
      expect(piece("front").height).toBeCloseTo(neck.front.height, 1);
      expect(piece("back").width).toBeCloseTo(470.5, 0);
      expect(piece("sleeve_left").width).toBeCloseTo(444.9, 0);
      expect(piece("sleeve_left").height).toBeCloseTo(210.2, 0);
      expect(piece("side_panel_left").width).toBeCloseTo(120.1, 0);
      expect(piece("side_panel_left").height).toBeCloseTo(410.5, 0);
      expect(piece("sleeve_right").width).toBeCloseTo(piece("sleeve_left").width, 1);
    });

    it(`uses one scale for every piece: a millimetre is ${neck.scale} texture pixels at 2048 on every piece`, () => {
      const scales = product.pieces.map((p) => pieceTextureScale(p, DEFAULT_TEXTURE_SIZE));
      for (const s of scales) {
        expect(s.x / scales[0]!.x).toBeCloseTo(1, 9);
        expect(s.y / scales[0]!.x).toBeCloseTo(1, 9);
      }
      expect(scales[0]!.x).toBeCloseTo(neck.scale, 3);
    });

    it("a 100 mm square on the front, the back and a sleeve is 100 mm in the texture and 95 to 105 mm along the cloth", () => {
      for (const [id, centre] of [
        ["front", { x: 235, y: 400 }],
        ["back", { x: 235, y: 330 }],
        ["sleeve_left", { x: 222, y: 110 }],
        ["sleeve_right", { x: 222, y: 110 }],
      ] as const) {
        const p = piece(id);
        const corners = [
          { x: centre.x - 50, y: centre.y - 50 },
          { x: centre.x + 50, y: centre.y - 50 },
          { x: centre.x + 50, y: centre.y + 50 },
          { x: centre.x - 50, y: centre.y + 50 },
        ];
        const a = pieceToUv(p, corners[0]!);
        const b = pieceToUv(p, corners[1]!);
        expect((b.u - a.u) * DEFAULT_TEXTURE_SIZE).toBeCloseTo(100 * neck.scale, 0);
        for (let k = 0; k < 4; k++) {
          const side = alongCloth(p, corners[k]!, corners[(k + 1) % 4]!);
          expect(side, `${id} side ${k}`).toBeGreaterThan(95);
          expect(side, `${id} side ${k}`).toBeLessThan(105);
        }
      }
    });

    it("a 100 mm line across and down a side panel is about 100 mm along the cloth", () => {
      const p = piece("side_panel_left");
      for (const [from, to] of [
        [{ x: 10, y: 200 }, { x: 110, y: 200 }],
        [{ x: 60, y: 100 }, { x: 60, y: 200 }],
      ] as const) {
        const length = alongCloth(p, from, to);
        expect(length).toBeGreaterThan(95);
        expect(length).toBeLessThan(105);
      }
    });

    it("keeps the garment's area within a few per cent of the flat pattern's, piece by piece", () => {
      for (const id of PIECES) {
        const p = piece(id);
        const { pos, uvs, idx } = meshes.get(id)!;
        let area3d = 0;
        let areaFlat = 0;
        for (let t = 0; t < idx.length; t += 3) {
          const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
          const e1 = [0, 1, 2].map((k) => (pos[b * 3 + k]! - pos[a * 3 + k]!) * 1000);
          const e2 = [0, 1, 2].map((k) => (pos[c * 3 + k]! - pos[a * 3 + k]!) * 1000);
          area3d += Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
          const [A, B, C] = [a, b, c].map((v) => uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! }));
          areaFlat += Math.abs((B!.x - A!.x) * (C!.y - A!.y) - (C!.x - A!.x) * (B!.y - A!.y)) / 2;
        }
        // The collar is a rib band, stretched round the neck (about 7% by area).
        expect(area3d / areaFlat, id).toBeGreaterThan(0.95);
        expect(area3d / areaFlat, id).toBeLessThan(id === "collar" ? 1.1 : 1.05);
      }
    });

    it("keeps every vertex's UV inside its own piece's outline (within a quarter millimetre) and its texture area", () => {
      for (const p of product.pieces) {
        const outline = pieceGeometry(p).outline.polylines;
        const rect = pieceTextureRect(p, DEFAULT_TEXTURE_SIZE);
        const { uvs } = meshes.get(p.mesh)!;
        for (let v = 0; v < uvs.length / 2; v++) {
          const point = uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! });
          expect(isInsidePiece(p, point) || distanceToPolylines(outline, point) <= 0.25, `vertex ${v} is outside the "${p.id}" outline`).toBe(true);
          expect(uvs[v * 2]! * DEFAULT_TEXTURE_SIZE).toBeGreaterThanOrEqual(rect.x - 0.016);
          expect(uvs[v * 2]! * DEFAULT_TEXTURE_SIZE).toBeLessThanOrEqual(rect.x + rect.width + 0.016);
        }
      }
    });

    it("maps a hit on each piece's mesh back to that piece (pointer to piece millimetres)", () => {
      for (const p of product.pieces) {
        const { uvs } = meshes.get(p.mesh)!;
        for (let v = 0; v < uvs.length / 2; v += 7) expect(pieceAtMeshUv(product, p.mesh, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! })?.piece.id).toBe(p.id);
      }
    });

    it("packs every piece into its own area without overlap, with room for the bleed", () => {
      const rects = product.pieces.map((p) => ({ id: p.id, ...p.uv }));
      expect(rects).toHaveLength(9);
      for (const a of rects) {
        expect(a.x).toBeGreaterThanOrEqual(1 / 128 - 1e-9);
        expect(a.y).toBeGreaterThanOrEqual(1 / 128 - 1e-9);
        expect(a.x + a.width).toBeLessThanOrEqual(1 - 1 / 128 + 1e-9);
        expect(a.y + a.height).toBeLessThanOrEqual(1 - 1 / 128 + 1e-9);
        for (const b of rects) {
          if (a.id >= b.id) continue;
          const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
          const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
          expect(Math.max(dx, dy), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(2 / 128 - 1e-9);
        }
      }
    });
  });

  describe("zones, placements and the texture", () => {
    it("has the zones a customer expects on a match jersey, each piece in the zone its source record names", () => {
      expect(product.zones.map((z) => z.id)).toEqual(["body_front", "body_back", "sleeves", "side_panels", "collar", "cuffs"]);
      expect(product.zones.map((z) => z.name)).toEqual(["Body front", "Body back", "Sleeves", "Side panels", "Collar", "Cuffs"]);
      for (const p of record.pieces) expect(piece(p.id).zone, p.id).toBe(p.zone);
      for (const p of product.pieces) expect(p.regions).toEqual([]);
    });

    it("shows every colour zone somewhere on the model", () => {
      const seen = new Set<string>();
      for (const p of product.pieces) {
        const { uvs } = meshes.get(p.mesh)!;
        const cu = p.uv.x + p.uv.width / 2;
        const cv = p.uv.y + p.uv.height / 2;
        for (let v = 0; v < uvs.length / 2; v++) {
          const hit = zoneAtUv(product, { u: uvs[v * 2]! + (cu - uvs[v * 2]!) * 0.001, v: uvs[v * 2 + 1]! + (cv - uvs[v * 2 + 1]!) * 0.001 });
          if (hit) seen.add(hit.zone);
        }
      }
      expect([...seen].sort()).toEqual(product.zones.map((z) => z.id).sort());
    });

    it("does not bleed: every texel the model samples (bilinear, 256 px texture) has its own piece's colour", () => {
      const palette = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"];
      const colours = Object.fromEntries(product.zones.map((z, k) => [z.id, palette[k]!]));
      const design = { ...createDesign(product), zones: Object.fromEntries(Object.entries(colours).map(([zone, hex]) => [zone, { id: `test-${zone}`, hex }])) };
      const size = 256;
      const ctx = new RasterContext(size, size);
      drawPatternTexture(ctx, product, design, { size });
      for (const p of product.pieces) {
        const { uvs } = meshes.get(p.mesh)!;
        for (let v = 0; v < uvs.length / 2; v++) {
          const x = uvs[v * 2]! * size - 0.5;
          const y = uvs[v * 2 + 1]! * size - 0.5;
          for (const [tx, ty] of [[Math.floor(x), Math.floor(y)], [Math.floor(x) + 1, Math.floor(y) + 1]] as const) {
            expect(ctx.pixel(tx, ty), `${p.id} samples texel (${tx}, ${ty})`).toBe(colours[p.zone]);
          }
        }
      }
    });

    it("places the centre chest, both chests, the numbers, the name and the sleeves on their pieces, inside the print areas", () => {
      expect(product.placements.map((p) => p.id)).toEqual(["chest-centre", "left-chest", "right-chest", "front-number", "upper-back", "back-name", "back-number", "lower-back", "sleeve-left", "sleeve-right"]);
      // The wearer's left chest is on the right of the front seen from outside.
      const left = product.placements.find((p) => p.id === "left-chest")!;
      expect(left.centre.x).toBeGreaterThan(piece("front").width / 2);
    });

    it("the front's print area lies inside the front (between the side panels' seams) and below the point of the V", () => {
      const front = piece("front");
      const area = front.printArea!;
      for (const corner of [
        { x: area.x, y: area.y },
        { x: area.x + area.width, y: area.y },
        { x: area.x, y: area.y + area.height },
        { x: area.x + area.width, y: area.y + area.height },
      ]) {
        expect(isInsidePiece(front, corner), JSON.stringify(corner)).toBe(true);
      }
      // The lowest point of the neckline on the front's centre line.
      let neckline = 0;
      for (let y = 0; y < front.height; y += 0.5) {
        if (isInsidePiece(front, { x: front.width / 2, y })) {
          neckline = y;
          break;
        }
      }
      expect(area.y).toBeGreaterThan(neckline);
    });
  });
});
