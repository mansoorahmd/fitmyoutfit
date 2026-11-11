import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO, type Document, type Primitive } from "@gltf-transform/core";
import { beforeAll, describe, expect, it } from "vitest";
import { loadStandInJerseyProduct } from "./fixtures";
import { RasterContext } from "./raster-context";
import { isInsidePiece, pieceGeometry, pieceToUv, uvToPiece, zoneAtPiecePoint, zoneAtUv } from "../design/pattern";
import { pieceAtMeshUv } from "../design/placement";
import { createDesign } from "../design/create";
import { distanceToPolylines, type PathPoint } from "../design/svg-path";
import type { PatternPiece } from "../design/schema";
import { DEFAULT_TEXTURE_SIZE, drawPatternTexture, pieceTextureRect, pieceTextureScale } from "../texture/pattern-texture";
import { KHRMeshQuantization } from "../../scripts/model-prep/quantize";
import { TriangleGrid, sideHitRates } from "../../scripts/model-prep/mesh3d";

// The stand-in football jersey: samples/models/stand-in-jersey.glb and samples/products/stand-in-jersey.json,
// both written by scripts/process-stand-in-model.ts from a Sketchfab download (see stand-in-jersey.source.json).
// These tests check that the two files describe the same garment, that a millimetre on a piece is a true
// millimetre in the texture and on the model, that the trims are pieces and zones of their own that sit
// cleanly in the cloth, and that the file is fit for a phone.

const root = resolve(import.meta.dirname, "../..");
const product = loadStandInJerseyProduct();
const glbPath = resolve(root, "samples/models/stand-in-jersey.glb");
const source = JSON.parse(readFileSync(resolve(root, "samples/models/stand-in-jersey.source.json"), "utf8")) as {
  source: { url: string; sha256: string; licence: string };
  pieces: Array<{ id: string; zone: string }>;
};

const piece = (id: string) => product.pieces.find((p) => p.id === id)!;
const SCALE = 1.576; // texture pixels per mm at 2048, the same on every piece

let doc: Document;
let prim: Primitive;
/** World positions (metres), normals, UVs and occlusion, decoded from the file's integers. */
let pos: Float64Array;
let nrm: Float64Array;
let uvs: Float64Array;
let occ: Float64Array;
let idx: Uint16Array;
/** Per piece: its triangles and its vertices. */
const trianglesOf = new Map<string, number[]>();
const verticesOf = new Map<string, number[]>();

beforeAll(async () => {
  doc = await new NodeIO().registerExtensions([KHRMeshQuantization]).readBinary(readFileSync(glbPath));
  const node = doc.getRoot().listNodes().find((n) => n.getMesh())!;
  prim = node.getMesh()!.listPrimitives()[0]!;
  const m = node.getWorldMatrix();
  const count = prim.getAttribute("POSITION")!.getCount();
  pos = new Float64Array(count * 3);
  nrm = new Float64Array(count * 3);
  uvs = new Float64Array(count * 2);
  occ = new Float64Array(count * 2);
  const e: number[] = [0, 0, 0];
  for (let v = 0; v < count; v++) {
    prim.getAttribute("POSITION")!.getElement(v, e);
    for (let a = 0; a < 3; a++) pos[v * 3 + a] = m[a]! * e[0]! + m[4 + a]! * e[1]! + m[8 + a]! * e[2]! + m[12 + a]!;
    prim.getAttribute("NORMAL")!.getElement(v, e);
    nrm.set(e, v * 3);
    const f: number[] = [0, 0];
    prim.getAttribute("TEXCOORD_0")!.getElement(v, f);
    uvs.set(f, v * 2);
    prim.getAttribute("_OCCLUSION")!.getElement(v, f);
    occ.set(f, v * 2);
  }
  idx = prim.getIndices()!.getArray() as Uint16Array;
  const pieceOfUv = (v: number) =>
    product.pieces.find((p) => uvs[v * 2]! >= p.uv.x - 1e-4 && uvs[v * 2]! <= p.uv.x + p.uv.width + 1e-4 && uvs[v * 2 + 1]! >= p.uv.y - 1e-4 && uvs[v * 2 + 1]! <= p.uv.y + p.uv.height + 1e-4)!.id;
  for (let v = 0; v < count; v++) verticesOf.set(pieceOfUv(v), [...(verticesOf.get(pieceOfUv(v)) ?? []), v]);
  for (let t = 0; t < idx.length / 3; t++) {
    const id = pieceOfUv(idx[t * 3]!);
    const list = trianglesOf.get(id);
    if (list) list.push(t);
    else trianglesOf.set(id, [t]);
  }
});

const P = (v: number): [number, number, number] => [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!];
const distanceMm = (a: number[], b: number[]) => 1000 * Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** The point on the 3D garment (metres) that shows a point of a piece (mm): found through the UVs. */
function onGarment(p: PatternPiece, point: PathPoint): [number, number, number] {
  const flat = (v: number) => uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! });
  for (const t of trianglesOf.get(p.id)!) {
    const [a, b, c] = [idx[t * 3]!, idx[t * 3 + 1]!, idx[t * 3 + 2]!];
    const [A, B, C] = [flat(a), flat(b), flat(c)];
    const det = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    const l1 = ((point.x - A.x) * (C.y - A.y) - (C.x - A.x) * (point.y - A.y)) / det;
    const l2 = ((B.x - A.x) * (point.y - A.y) - (point.x - A.x) * (B.y - A.y)) / det;
    const l0 = 1 - l1 - l2;
    if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) {
      return [0, 1, 2].map((k) => l0 * pos[a * 3 + k]! + l1 * pos[b * 3 + k]! + l2 * pos[c * 3 + k]!) as [number, number, number];
    }
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

describe("stand-in jersey: the file", () => {
  it("is small enough for a phone: 1.69 MB, under 2 MB", () => {
    const size = statSync(glbPath).size;
    expect(size).toBeLessThan(2_000_000);
    expect(size).toBeGreaterThan(1_500_000); // a much smaller file would have lost geometry
  });

  it("keeps the outer surface and the trims only: 103,266 triangles, in one mesh (one draw call)", () => {
    expect(idx.length / 3).toBe(103_266);
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(doc.getRoot().listMeshes()[0]!.listPrimitives()).toHaveLength(1);
    expect(doc.getRoot().listMeshes()[0]!.getName()).toBe("jersey");
    for (const p of product.pieces) expect(p.mesh).toBe("jersey");
  });

  it("uses 16-bit indices and integer vertex data (KHR_mesh_quantization), and only the data the editor uses", () => {
    expect(prim.getIndices()!.getComponentType()).toBe(5123); // UNSIGNED_SHORT
    expect(prim.listSemantics().sort()).toEqual(["NORMAL", "POSITION", "TEXCOORD_0", "_OCCLUSION"]);
    expect(prim.getAttribute("POSITION")!.getComponentType()).toBe(5122); // SHORT
    expect(prim.getAttribute("NORMAL")!.getComponentType()).toBe(5120); // BYTE
    expect(prim.getAttribute("TEXCOORD_0")!.getComponentType()).toBe(5123);
    for (const s of ["POSITION", "NORMAL", "TEXCOORD_0", "_OCCLUSION"]) expect(prim.getAttribute(s)!.getNormalized(), s).toBe(true);
    const required = doc.getRoot().listExtensionsRequired().map((e) => e.extensionName);
    expect(required).toEqual(["KHR_mesh_quantization"]);
  });

  it("holds no textures and one plain material: the colours come from the design, drawn at run time", () => {
    expect(doc.getRoot().listTextures()).toEqual([]);
    const materials = doc.getRoot().listMaterials();
    expect(materials).toHaveLength(1);
    expect(materials[0]!.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
    expect(materials[0]!.getMetallicFactor()).toBe(0);
    expect(materials[0]!.getDoubleSided()).toBe(true);
  });

  it("credits the source as CC BY 4.0 asks: title, author, source, licence, and that we changed it", () => {
    const copyright = doc.getRoot().getAsset().copyright ?? "";
    expect(copyright).toContain('"Jersey Patterns 3D Free" by Wearable3D');
    expect(copyright).toContain("https://sketchfab.com/3d-models/jersey-patterns-3d-free-a6b7401510484ee1b375c02f97f14e86");
    expect(copyright).toContain("CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/)");
    expect(copyright).toContain("Changed for FitMyOutfit");
    expect(source.source.licence).toBe("CC-BY-4.0");
    expect(source.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    const notice = readFileSync(resolve(root, "samples/models/stand-in-jersey.LICENSE.txt"), "utf8");
    for (const text of ["Jersey Patterns 3D Free", "Wearable3D", source.source.url, "Creative Commons Attribution 4.0", "https://creativecommons.org/licenses/by/4.0/", "What we changed"]) {
      expect(notice).toContain(text);
    }
  });

  it("is served from the URL named in the product definition", () => {
    expect(product.model.url).toBe("/models/stand-in-jersey.glb");
    expect(product.id).toBe("stand-in-jersey");
  });
});

describe("stand-in jersey: geometry", () => {
  const centroid = (id: string) => {
    const vs = verticesOf.get(id)!;
    const c = [0, 0, 0];
    for (const v of vs) for (let k = 0; k < 3; k++) c[k]! += pos[v * 3 + k]! / vs.length;
    return c;
  };

  it("stands on Y = 0, centred, the wearer facing +Z with their left at +X (the source was Z up, in centimetres)", () => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let v = 0; v < pos.length / 3; v++) {
      minY = Math.min(minY, pos[v * 3 + 1]!);
      maxY = Math.max(maxY, pos[v * 3 + 1]!);
    }
    expect(minY).toBeCloseTo(0, 4);
    expect(maxY).toBeCloseTo(0.69, 2); // 69 cm tall: metres, not centimetres
    expect(centroid("front")[2]).toBeGreaterThan(centroid("back")[2]!);
    expect(centroid("sleeve_left")[0]).toBeGreaterThan(0.15);
    expect(centroid("sleeve_right")[0]).toBeLessThan(-0.15);
    expect(centroid("collar")[1]).toBeGreaterThan(0.6);
  });

  it("winds every triangle counter-clockwise seen from outside, and its normals agree", () => {
    for (const p of product.pieces) {
      let agree = 0;
      const tris = trianglesOf.get(p.id)!;
      for (const t of tris) {
        const [a, b, c] = [idx[t * 3]!, idx[t * 3 + 1]!, idx[t * 3 + 2]!];
        const e1 = [0, 1, 2].map((k) => pos[b * 3 + k]! - pos[a * 3 + k]!);
        const e2 = [0, 1, 2].map((k) => pos[c * 3 + k]! - pos[a * 3 + k]!);
        const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        const n = [0, 1, 2].map((k) => nrm[a * 3 + k]! + nrm[b * 3 + k]! + nrm[c * 3 + k]!);
        if (face[0]! * n[0]! + face[1]! * n[1]! + face[2]! * n[2]! > 0) agree++;
      }
      expect(agree / tris.length, p.id).toBeGreaterThan(0.995);
    }
    for (let v = 0; v < nrm.length; v += 3) expect(Math.abs(Math.hypot(nrm[v]!, nrm[v + 1]!, nrm[v + 2]!) - 1)).toBeLessThan(0.012); // 8-bit normals
    const facing = (id: string) => trianglesOf.get(id)!.reduce((z, t) => z + nrm[idx[t * 3]! * 3 + 2]!, 0);
    expect(facing("front")).toBeGreaterThan(0);
    expect(facing("back")).toBeLessThan(0);
  });

  it("has closed seams: edge vertices of two pieces that meet are at exactly the same place", () => {
    const pieceOfVertex = new Map<number, string>();
    for (const [id, vs] of verticesOf) for (const v of vs) pieceOfVertex.set(v, id);
    const grid = new Map<string, number[]>();
    const key = (p: number[]) => p.map((x) => Math.floor(x / 0.002)).join(",");
    for (let v = 0; v < pos.length / 3; v++) {
      const k = key(P(v));
      const list = grid.get(k);
      if (list) list.push(v);
      else grid.set(k, [v]);
    }
    let seamVertices = 0;
    let open = 0;
    const pairs = new Set<string>();
    for (let v = 0; v < pos.length / 3; v++) {
      const c = P(v).map((x) => Math.floor(x / 0.002));
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const w of grid.get(`${c[0]! + dx},${c[1]! + dy},${c[2]! + dz}`) ?? []) {
              if (pieceOfVertex.get(w) === pieceOfVertex.get(v)) continue;
              const d = distanceMm(P(v), P(w));
              if (d < 1) {
                seamVertices++;
                pairs.add([pieceOfVertex.get(v), pieceOfVertex.get(w)].sort().join(" / "));
                if (d > 1e-6) open++;
              }
            }
    }
    expect(seamVertices).toBeGreaterThan(3000);
    expect(open).toBe(0);
    // The trims are sewn in: each cuff meets its sleeve, each collar strip the next.
    for (const pair of ["cuff_left / sleeve_left", "cuff_left / sleeve_strip_left", "cuff_stripe_left / sleeve_strip_left", "collar / collar_strip", "collar_strip / collar_stripe", "back / collar_stripe", "collar_stripe / front", "side_panel_left / side_strip_left_1"]) {
      expect(pairs, pair).toContain(pair);
    }
  });

  it("lays no surface on another: within 0.2 mm of any piece there is no other cloth (no flicker where a stripe meets a panel)", () => {
    const meshes = product.pieces.map((p) => {
      const tris = trianglesOf.get(p.id)!;
      const indices = new Uint32Array(tris.length * 3);
      tris.forEach((t, k) => indices.set([idx[t * 3]!, idx[t * 3 + 1]!, idx[t * 3 + 2]!], k * 3));
      return { positions: pos, indices };
    });
    const grid = new TriangleGrid(meshes, 0.015);
    meshes.forEach((m, k) => {
      const r = sideHitRates(grid, k, m, { samples: 120, maxDistance: 0.0002, offset: 0.00001, seed: 900 + k });
      expect(r.front + r.back, product.pieces[k]!.id).toBeLessThanOrEqual(0.02);
    });
  });

  it("bakes occlusion for both sides: the inside darker than the outside on the body pieces", () => {
    for (const id of ["front", "back", "sleeve_left", "sleeve_right", "side_panel_left", "side_panel_right", "collar"]) {
      let outer = 0;
      let inner = 0;
      for (const v of verticesOf.get(id)!) {
        outer += occ[v * 2]!;
        inner += occ[v * 2 + 1]!;
      }
      expect(inner, id).toBeLessThan(outer);
    }
  });
});

describe("stand-in jersey: pieces, UVs and millimetres", () => {
  it("traces the front at 670.9 x 718.0 mm, the back at 491.4 x 719.7 mm, the sleeves at 371.2 x 212.2 mm", () => {
    expect(piece("front").width).toBeCloseTo(670.89, 2);
    expect(piece("front").height).toBeCloseTo(717.98, 2);
    expect(piece("back").width).toBeCloseTo(491.44, 2);
    expect(piece("back").height).toBeCloseTo(719.7, 2);
    expect(piece("sleeve_left").width).toBeCloseTo(371.23, 2);
    expect(piece("sleeve_left").height).toBeCloseTo(212.19, 2);
    expect(piece("sleeve_right").width).toBeCloseTo(piece("sleeve_left").width, 1);
  });

  it("has a real jersey's size (a men's M): 103 cm round the chest, a 72 cm back, a 23 cm sleeve", () => {
    // Chest: the cloth's girth 25 mm below the underarm (the top of the side panels), sleeves left out.
    const sleeves = new Set(["sleeve_left", "sleeve_right", "cuff_left", "cuff_right", "sleeve_strip_left", "sleeve_strip_right", "cuff_stripe_left", "cuff_stripe_right"]);
    let underarm = -Infinity;
    for (const v of [...verticesOf.get("side_panel_left")!, ...verticesOf.get("side_panel_right")!]) underarm = Math.max(underarm, pos[v * 3 + 1]!);
    const h = underarm - 0.025;
    let girth = 0;
    for (const [id, tris] of trianglesOf) {
      if (sleeves.has(id)) continue;
      for (const t of tris) {
        const cut: number[][] = [];
        for (let k = 0; k < 3; k++) {
          const a = idx[t * 3 + k]!;
          const b = idx[t * 3 + ((k + 1) % 3)]!;
          const ya = pos[a * 3 + 1]! - h;
          const yb = pos[b * 3 + 1]! - h;
          if (ya < 0 !== yb < 0) {
            const s = ya / (ya - yb);
            cut.push([pos[a * 3]! + s * (pos[b * 3]! - pos[a * 3]!), pos[a * 3 + 2]! + s * (pos[b * 3 + 2]! - pos[a * 3 + 2]!)]);
          }
        }
        if (cut.length === 2) girth += Math.hypot(cut[0]![0]! - cut[1]![0]!, cut[0]![1]! - cut[1]![1]!);
      }
    }
    expect(girth * 100).toBeGreaterThan(100);
    expect(girth * 100).toBeLessThan(106); // 102.7 cm: half is 51 cm, a men's M
    // Back length: the back piece down its centre, plus the collar's three strips above it.
    const back = piece("back");
    const collarHeight = piece("collar").height + piece("collar_strip").height + piece("collar_stripe").height;
    expect(back.height - 18.5 + collarHeight).toBeGreaterThan(710);
    expect(back.height - 18.5 + collarHeight).toBeLessThan(730);
    // Sleeve: the sleeve piece from its cap, plus the cuff, the strip and the cuff stripe.
    const sleeve = piece("sleeve_left").height + 12.9 + 2.5 + 5.1;
    expect(sleeve).toBeGreaterThan(220);
    expect(sleeve).toBeLessThan(245);
  });

  it("uses one scale for every piece: a millimetre is 1.576 texture pixels at 2048 on every piece", () => {
    const scales = product.pieces.map((p) => pieceTextureScale(p, DEFAULT_TEXTURE_SIZE));
    for (const s of scales) {
      expect(s.x / scales[0]!.x).toBeCloseTo(1, 9);
      expect(s.y / scales[0]!.x).toBeCloseTo(1, 9);
    }
    expect(scales[0]!.x).toBeCloseTo(SCALE, 3);
  });

  it("a 100 mm square is 158 texture pixels on the front, a sleeve and the back, and about 100 mm along the cloth", () => {
    for (const [id, centre] of [
      ["front", { x: 335, y: 420 }],
      ["sleeve_left", { x: 186, y: 120 }],
      ["back", { x: 244, y: 330 }],
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
      const d = pieceToUv(p, corners[3]!);
      expect((b.u - a.u) * DEFAULT_TEXTURE_SIZE).toBeCloseTo(100 * SCALE, 1);
      expect((d.v - a.v) * DEFAULT_TEXTURE_SIZE).toBeCloseTo(100 * SCALE, 1);
      for (let k = 0; k < 4; k++) {
        const side = alongCloth(p, corners[k]!, corners[(k + 1) % 4]!);
        expect(side, `${id} side ${k}`).toBeGreaterThan(95);
        expect(side, `${id} side ${k}`).toBeLessThan(105);
      }
    }
  });

  it("a 100 mm line across and down a side panel is 158 texture pixels and about 100 mm along the cloth", () => {
    // The side panel is a leaf about 150 mm across at most: no 100 mm square fits in it, two lines do.
    const p = piece("side_panel_left");
    for (const [from, to] of [
      [{ x: 25, y: 165 }, { x: 125, y: 165 }],
      [{ x: 100, y: 100 }, { x: 100, y: 200 }],
    ] as const) {
      const a = pieceToUv(p, from);
      const b = pieceToUv(p, to);
      expect(Math.hypot(b.u - a.u, b.v - a.v) * DEFAULT_TEXTURE_SIZE).toBeCloseTo(100 * SCALE, 1);
      const length = alongCloth(p, from, to);
      expect(length).toBeGreaterThan(95);
      expect(length).toBeLessThan(105);
    }
  });

  it("keeps the garment's area within a few per cent of the flat pattern's, piece by piece", () => {
    for (const id of ["front", "back", "sleeve_left", "sleeve_right", "side_panel_left", "side_panel_right", "collar", "cuff_left"]) {
      const p = piece(id);
      let area3d = 0;
      let areaFlat = 0;
      for (const t of trianglesOf.get(id)!) {
        const [a, b, c] = [idx[t * 3]!, idx[t * 3 + 1]!, idx[t * 3 + 2]!];
        const e1 = [0, 1, 2].map((k) => (pos[b * 3 + k]! - pos[a * 3 + k]!) * 1000);
        const e2 = [0, 1, 2].map((k) => (pos[c * 3 + k]! - pos[a * 3 + k]!) * 1000);
        area3d += Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
        const [A, B, C] = [a, b, c].map((v) => uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! }));
        areaFlat += Math.abs((B!.x - A!.x) * (C!.y - A!.y) - (C!.x - A!.x) * (B!.y - A!.y)) / 2;
      }
      expect(area3d / areaFlat, id).toBeGreaterThan(0.93);
      expect(area3d / areaFlat, id).toBeLessThan(1.05);
    }
  });

  it("keeps every vertex's UV inside its own piece's outline (within a quarter millimetre) and its texture area", () => {
    for (const p of product.pieces) {
      const outline = pieceGeometry(p).outline.polylines;
      const rect = pieceTextureRect(p, DEFAULT_TEXTURE_SIZE);
      for (const v of verticesOf.get(p.id)!) {
        const point = uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! });
        const inside = isInsidePiece(p, point) || distanceToPolylines(outline, point) <= 0.25;
        expect(inside, `vertex ${v} is outside the "${p.id}" outline`).toBe(true);
        // UVs are stored to 1/65535: at 2048 px that is 0.031 px, so half a step either way.
        expect(uvs[v * 2]! * DEFAULT_TEXTURE_SIZE).toBeGreaterThanOrEqual(rect.x - 0.016);
        expect(uvs[v * 2]! * DEFAULT_TEXTURE_SIZE).toBeLessThanOrEqual(rect.x + rect.width + 0.016);
      }
    }
  });

  it("covers its piece: each piece's vertices reach every edge of its outline's box", () => {
    for (const p of product.pieces) {
      const points = verticesOf.get(p.id)!.map((v) => uvToPiece(p, { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! }));
      expect(Math.min(...points.map((q) => q.x)), p.id).toBeCloseTo(0, 1);
      expect(Math.max(...points.map((q) => q.x)), p.id).toBeCloseTo(p.width, 1);
      expect(Math.min(...points.map((q) => q.y)), p.id).toBeCloseTo(0, 1);
      expect(Math.max(...points.map((q) => q.y)), p.id).toBeCloseTo(p.height, 1);
    }
  });

  it("maps a hit anywhere on the one mesh back to the right piece (pointer to piece millimetres)", () => {
    for (const p of product.pieces) {
      for (const v of verticesOf.get(p.id)!) {
        expect(pieceAtMeshUv(product, "jersey", { u: uvs[v * 2]!, v: uvs[v * 2 + 1]! })?.piece.id).toBe(p.id);
      }
    }
  });

  it("packs every piece, trims too, into its own area without overlap, with room for the bleed", () => {
    const rects = product.pieces.map((p) => ({ id: p.id, ...p.uv }));
    expect(rects).toHaveLength(27);
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

describe("stand-in jersey: colour zones and the texture", () => {
  it("has the zones a coach would recognise, the trims among them, each piece in the zone its source record names", () => {
    expect(product.zones.map((z) => z.id)).toEqual(["body_front", "body_back", "sleeves", "side_panels", "collar", "collar_stripe", "cuffs", "cuff_stripes", "side_stripes"]);
    expect(product.zones.map((z) => z.name)).toEqual(["Body front", "Body back", "Sleeves", "Side panels", "Collar", "Collar stripe", "Cuffs", "Cuff stripes", "Side stripes"]);
    for (const p of source.pieces) expect(piece(p.id).zone, p.id).toBe(p.zone);
    expect(piece("front").zone).toBe("body_front");
    expect(piece("cuff_left").zone).toBe("cuffs");
    expect(piece("collar_stripe").zone).toBe("collar_stripe");
    expect(product.pieces.filter((p) => p.zone === "side_stripes")).toHaveLength(8);
    // Whole pieces: the trims are their own geometry, so no piece needs a region.
    for (const p of product.pieces) expect(p.regions).toEqual([]);
    expect(zoneAtPiecePoint(piece("cuff_left"), { x: piece("cuff_left").width / 2, y: 5 })).toBe("cuffs");
  });

  it("shows every colour zone somewhere on the model", () => {
    const seen = new Set<string>();
    for (const p of product.pieces) {
      const cu = p.uv.x + p.uv.width / 2;
      const cv = p.uv.y + p.uv.height / 2;
      for (const v of verticesOf.get(p.id)!) {
        const hit = zoneAtUv(product, { u: uvs[v * 2]! + (cu - uvs[v * 2]!) * 0.001, v: uvs[v * 2 + 1]! + (cv - uvs[v * 2 + 1]!) * 0.001 });
        if (hit) seen.add(hit.zone);
      }
    }
    expect([...seen].sort()).toEqual(product.zones.map((z) => z.id).sort());
  });

  it("does not bleed: every texel the model samples (bilinear, 256 px texture) has its own piece's colour", () => {
    const palette = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#800000", "#008000", "#000080"];
    const colours = Object.fromEntries(product.zones.map((z, k) => [z.id, palette[k]!]));
    let design = createDesign(product);
    design = { ...design, zones: Object.fromEntries(Object.entries(colours).map(([zone, hex]) => [zone, { id: `test-${zone}`, hex }])) };
    const size = 256;
    const ctx = new RasterContext(size, size);
    drawPatternTexture(ctx, product, design, { size });
    for (const p of product.pieces) {
      const allowed = colours[p.zone]!;
      for (const v of verticesOf.get(p.id)!) {
        const x = uvs[v * 2]! * size - 0.5;
        const y = uvs[v * 2 + 1]! * size - 0.5;
        for (const [tx, ty] of [
          [Math.floor(x), Math.floor(y)],
          [Math.floor(x) + 1, Math.floor(y)],
          [Math.floor(x), Math.floor(y) + 1],
          [Math.floor(x) + 1, Math.floor(y) + 1],
        ] as const) {
          expect(ctx.pixel(tx, ty), `${p.id} samples texel (${tx}, ${ty})`).toBe(allowed);
        }
      }
    }
  });
});
