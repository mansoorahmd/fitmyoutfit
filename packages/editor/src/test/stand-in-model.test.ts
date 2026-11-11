import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO, type Document, type Primitive } from "@gltf-transform/core";
import { beforeAll, describe, expect, it } from "vitest";
import { loadStandInProduct } from "./fixtures";
import { RasterContext } from "./raster-context";
import { isInsidePiece, pieceGeometry, pieceToUv, uvToPiece, zoneAtPiecePoint, zoneAtUv } from "../design/pattern";
import { pieceAtMeshUv } from "../design/placement";
import { createDesign } from "../design/create";
import { distanceToPolylines, type PathPoint } from "../design/svg-path";
import type { PatternPiece } from "../design/schema";
import { DEFAULT_TEXTURE_SIZE, drawPatternTexture, pieceTextureRect, pieceTextureScale } from "../texture/pattern-texture";

// The stand-in T-shirt: samples/models/stand-in-tshirt.glb and samples/products/stand-in-tshirt.json,
// both written by scripts/process-stand-in-model.ts from a CLO export (see stand-in-tshirt.source.json).
// These tests check the two files describe the same garment, that a millimetre on a piece is a true
// millimetre on the model and in the texture, and that the file is fit for a phone.

const root = resolve(import.meta.dirname, "../..");
const product = loadStandInProduct();
const glbPath = resolve(root, "samples/models/stand-in-tshirt.glb");
const source = JSON.parse(readFileSync(resolve(root, "samples/models/stand-in-tshirt.source.json"), "utf8")) as {
  source: { url: string; copyright: string; sha256: string };
};

let doc: Document;
beforeAll(async () => {
  doc = await new NodeIO().readBinary(readFileSync(glbPath));
});

const piece = (id: string) => product.pieces.find((p) => p.id === id)!;
function primitiveOf(meshName: string): Primitive {
  const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === meshName);
  expect(mesh, `mesh "${meshName}"`).toBeDefined();
  expect(mesh!.listPrimitives()).toHaveLength(1);
  return mesh!.listPrimitives()[0]!;
}
const array = (prim: Primitive, semantic: string) => prim.getAttribute(semantic)!.getArray()!;
const indicesOf = (prim: Primitive) => prim.getIndices()!.getArray()!;
function uvsOf(meshName: string): Array<[number, number]> {
  const uv = array(primitiveOf(meshName), "TEXCOORD_0");
  const out: Array<[number, number]> = [];
  for (let i = 0; i < uv.length; i += 2) out.push([uv[i]!, uv[i + 1]!]);
  return out;
}

/** The point on the 3D garment (metres) that shows a point of a piece (mm): found through the UVs. */
function onGarment(p: PatternPiece, point: PathPoint): [number, number, number] {
  const prim = primitiveOf(p.mesh);
  const pos = array(prim, "POSITION");
  const uv = array(prim, "TEXCOORD_0");
  const idx = indicesOf(prim);
  const flat = (v: number) => uvToPiece(p, { u: uv[v * 2]!, v: uv[v * 2 + 1]! });
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const [A, B, C] = [flat(a), flat(b), flat(c)];
    const det = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    const l1 = ((point.x - A.x) * (C.y - A.y) - (C.x - A.x) * (point.y - A.y)) / det;
    const l2 = ((B.x - A.x) * (point.y - A.y) - (point.x - A.x) * (B.y - A.y)) / det;
    const l0 = 1 - l1 - l2;
    if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) {
      return [0, 1, 2].map((k) => l0 * pos[a * 3 + k]! + l1 * pos[b * 3 + k]! + l2 * pos[c * 3 + k]!) as [number, number, number];
    }
  }
  throw new Error(`(${point.x}, ${point.y}) mm is not on the "${p.id}" mesh`);
}
const distanceMm = (a: number[], b: number[]) => 1000 * Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("stand-in T-shirt: the file", () => {
  it("is small enough for a phone (under 2 MB)", () => {
    const size = statSync(glbPath).size;
    expect(size).toBeLessThan(2_000_000);
  });

  it("keeps only the outer surface: 43,138 triangles in seven meshes", () => {
    const triangles = product.pieces.reduce((n, p) => n + indicesOf(primitiveOf(p.mesh)).length / 3, 0);
    expect(triangles).toBe(43_138);
    expect(doc.getRoot().listMeshes()).toHaveLength(7);
  });

  it("uses 16-bit indices and only the data the editor uses", () => {
    for (const p of product.pieces) {
      const prim = primitiveOf(p.mesh);
      expect(prim.getIndices()!.getComponentType()).toBe(5123); // UNSIGNED_SHORT
      expect(prim.listSemantics().sort()).toEqual(["NORMAL", "POSITION", "TEXCOORD_0", "_OCCLUSION"]);
    }
  });

  it("holds no textures and one plain material: the colours come from the design, drawn at run time", () => {
    expect(doc.getRoot().listTextures()).toEqual([]);
    const materials = doc.getRoot().listMaterials();
    expect(materials).toHaveLength(1);
    expect(materials[0]!.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
    expect(materials[0]!.getMetallicFactor()).toBe(0);
    expect(materials[0]!.getDoubleSided()).toBe(true);
  });

  it("carries the source's copyright and licence", () => {
    const copyright = doc.getRoot().getAsset().copyright ?? "";
    expect(copyright).toContain("Copyright (c) 2021 Prashant Verma");
    expect(copyright).toContain("MIT License");
    expect(copyright).toContain("https://github.com/prashant3285/garment");
    expect(source.source.copyright).toBe("Copyright (c) 2021 Prashant Verma");
    expect(source.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is served from the URL named in the product definition, and has a mesh and a node per piece", () => {
    expect(product.model.url).toBe("/models/stand-in-tshirt.glb");
    const nodes = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
    for (const p of product.pieces) expect(nodes, `node for "${p.id}"`).toContain(p.mesh);
  });
});

describe("stand-in T-shirt: geometry", () => {
  const centroid = (meshName: string) => {
    const pos = array(primitiveOf(meshName), "POSITION");
    const c = [0, 0, 0];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) c[k]! += pos[i + k]! / (pos.length / 3);
    return c;
  };

  it("stands on Y = 0, centred, the wearer facing +Z with their left at +X", () => {
    let minY = Infinity;
    for (const p of product.pieces) {
      const pos = array(primitiveOf(p.mesh), "POSITION");
      for (let i = 1; i < pos.length; i += 3) minY = Math.min(minY, pos[i]!);
    }
    expect(minY).toBeCloseTo(0, 6);
    expect(centroid("front")[2]).toBeGreaterThan(centroid("back")[2]!);
    expect(centroid("sleeve_left")[0]).toBeGreaterThan(0.15);
    expect(centroid("sleeve_right")[0]).toBeLessThan(-0.15);
  });

  it("winds every triangle counter-clockwise seen from outside, and its normals agree", () => {
    for (const p of product.pieces) {
      const prim = primitiveOf(p.mesh);
      const pos = array(prim, "POSITION");
      const nrm = array(prim, "NORMAL");
      const idx = indicesOf(prim);
      let agree = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
        const e1 = [0, 1, 2].map((k) => pos[b * 3 + k]! - pos[a * 3 + k]!);
        const e2 = [0, 1, 2].map((k) => pos[c * 3 + k]! - pos[a * 3 + k]!);
        const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        const n = [0, 1, 2].map((k) => nrm[a * 3 + k]! + nrm[b * 3 + k]! + nrm[c * 3 + k]!);
        if (face[0]! * n[0]! + face[1]! * n[1]! + face[2]! * n[2]! > 0) agree++;
      }
      expect(agree / (idx.length / 3), p.id).toBeGreaterThan(0.999);
      for (let v = 0; v < nrm.length; v += 3) expect(Math.hypot(nrm[v]!, nrm[v + 1]!, nrm[v + 2]!)).toBeCloseTo(1, 4);
    }
    // Outside: the front faces forwards, the back backwards.
    const facing = (meshName: string) => {
      const nrm = array(primitiveOf(meshName), "NORMAL");
      let z = 0;
      for (let v = 2; v < nrm.length; v += 3) z += nrm[v]!;
      return z;
    };
    expect(facing("front")).toBeGreaterThan(0);
    expect(facing("back")).toBeLessThan(0);
  });

  it("has closed seams: edge vertices of two pieces that meet are at exactly the same place", () => {
    const points: Array<{ piece: string; p: number[] }> = [];
    for (const p of product.pieces) {
      const pos = array(primitiveOf(p.mesh), "POSITION");
      for (let i = 0; i < pos.length; i += 3) points.push({ piece: p.id, p: [pos[i]!, pos[i + 1]!, pos[i + 2]!] });
    }
    const grid = new Map<string, number[]>();
    const key = (p: number[]) => p.map((x) => Math.floor(x / 0.002)).join(",");
    points.forEach((q, k) => grid.set(key(q.p), [...(grid.get(key(q.p)) ?? []), k]));
    let seamVertices = 0;
    let open = 0;
    points.forEach((q) => {
      const c = q.p.map((x) => Math.floor(x / 0.002));
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const j of grid.get(`${c[0]! + dx},${c[1]! + dy},${c[2]! + dz}`) ?? []) {
              const other = points[j]!;
              if (other.piece === q.piece) continue;
              const d = distanceMm(q.p, other.p);
              if (d < 1) {
                seamVertices++;
                if (d > 1e-6) open++;
              }
            }
    });
    expect(seamVertices).toBeGreaterThan(500);
    expect(open).toBe(0);
  });

  it("bakes occlusion for both sides: values 0 to 1, the inside darker than the outside", () => {
    for (const p of product.pieces) {
      const occ = array(primitiveOf(p.mesh), "_OCCLUSION");
      let outer = 0;
      let inner = 0;
      for (let v = 0; v < occ.length; v += 2) {
        outer += occ[v]! / 65535;
        inner += occ[v + 1]! / 65535;
      }
      expect(inner, p.id).toBeLessThan(outer);
    }
  });
});

describe("stand-in T-shirt: pieces, UVs and millimetres", () => {
  it("traces the front at 520.4 x 712.6 mm and the back at 522.2 x 738.7 mm (a size L T-shirt's flat pattern)", () => {
    expect(piece("front").width).toBeCloseTo(520.37, 2);
    expect(piece("front").height).toBeCloseTo(712.64, 2);
    expect(piece("back").width).toBeCloseTo(522.2, 2);
    expect(piece("back").height).toBeCloseTo(738.74, 2);
    expect(piece("sleeve_left").width).toBeCloseTo(417.8, 1);
    expect(piece("sleeve_left").height).toBeCloseTo(182.71, 1);
  });

  it("measures 103 cm round the chest, 25 mm below the armholes, across front and back", () => {
    // The width of each body piece's outline at 25 mm below its underarm point (where the side panels start).
    const widthBelowUnderarm = (id: string) => {
      const p = piece(id);
      const sidePanel = p.regions.find((r) => r.zone === "side_panels")!;
      const underarm = Number(/^M -?[\d.]+ ([\d.]+)/.exec(sidePanel.path)![1]);
      const lines = pieceGeometry(p).outline.polylines;
      const xs: number[] = [];
      const y = underarm + 25;
      for (const line of lines) {
        const pts = line.points;
        for (let k = 0; k < pts.length; k++) {
          const a = pts[k]!;
          const b = pts[(k + 1) % pts.length]!;
          if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
      return Math.max(...xs) - Math.min(...xs);
    };
    const chest = widthBelowUnderarm("front") + widthBelowUnderarm("back");
    expect(chest).toBeGreaterThan(1000);
    expect(chest).toBeLessThan(1060);
  });

  it("uses one scale for every piece: a millimetre is the same number of texture pixels everywhere", () => {
    const scales = product.pieces.map((p) => pieceTextureScale(p, DEFAULT_TEXTURE_SIZE));
    for (const s of scales) {
      expect(s.x / scales[0]!.x).toBeCloseTo(1, 9);
      expect(s.y / scales[0]!.x).toBeCloseTo(1, 9);
    }
    expect(scales[0]!.x).toBeCloseTo(1.903, 3); // texture pixels per mm at 2048
  });

  it("a 100 mm square is 190 texture pixels on the front and on a sleeve, and 100 mm on the garment", () => {
    for (const [id, centre] of [
      ["front", { x: 260, y: 420 }],
      ["sleeve_left", { x: 209, y: 110 }],
      ["back", { x: 261, y: 330 }],
    ] as const) {
      const p = piece(id);
      const corners = [
        { x: centre.x - 50, y: centre.y - 50 },
        { x: centre.x + 50, y: centre.y - 50 },
        { x: centre.x + 50, y: centre.y + 50 },
        { x: centre.x - 50, y: centre.y + 50 },
      ];
      // In the texture: 100 mm times the one scale, whichever piece.
      const a = pieceToUv(p, corners[0]!);
      const b = pieceToUv(p, corners[1]!);
      const d = pieceToUv(p, corners[3]!);
      expect((b.u - a.u) * DEFAULT_TEXTURE_SIZE).toBeCloseTo(100 * 1.903, 0);
      expect((d.v - a.v) * DEFAULT_TEXTURE_SIZE).toBeCloseTo(100 * 1.903, 0);
      // Relative to the piece: as on the flat pattern.
      expect((b.u - a.u) / p.uv.width).toBeCloseTo(100 / p.width, 9);
      // On the garment: each side of the square, measured along the cloth (20 steps), is 100 mm,
      // give or take the few per cent the cloth simulation stretched or eased it.
      for (let k = 0; k < 4; k++) {
        const from = corners[k]!;
        const to = corners[(k + 1) % 4]!;
        let side = 0;
        let previous = onGarment(p, from);
        for (let s = 1; s <= 20; s++) {
          const next = onGarment(p, { x: from.x + ((to.x - from.x) * s) / 20, y: from.y + ((to.y - from.y) * s) / 20 });
          side += distanceMm(previous, next);
          previous = next;
        }
        expect(side, `${id} side ${k}`).toBeGreaterThan(95);
        expect(side, `${id} side ${k}`).toBeLessThan(103);
      }
    }
  });

  it("keeps the garment's area within a few per cent of the flat pattern's, piece by piece", () => {
    for (const id of ["front", "back", "sleeve_left", "sleeve_right"]) {
      const p = piece(id);
      const prim = primitiveOf(p.mesh);
      const pos = array(prim, "POSITION");
      const uv = array(prim, "TEXCOORD_0");
      const idx = indicesOf(prim);
      let area3d = 0;
      let areaFlat = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
        const e1 = [0, 1, 2].map((k) => (pos[b * 3 + k]! - pos[a * 3 + k]!) * 1000);
        const e2 = [0, 1, 2].map((k) => (pos[c * 3 + k]! - pos[a * 3 + k]!) * 1000);
        area3d += Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
        const [A, B, C] = [a, b, c].map((v) => uvToPiece(p, { u: uv[v * 2]!, v: uv[v * 2 + 1]! }));
        areaFlat += Math.abs((B!.x - A!.x) * (C!.y - A!.y) - (C!.x - A!.x) * (B!.y - A!.y)) / 2;
      }
      expect(area3d / areaFlat, id).toBeGreaterThan(0.9);
      expect(area3d / areaFlat, id).toBeLessThan(1.02);
    }
  });

  it("keeps every mesh's UVs inside its own piece's outline (within a quarter millimetre)", () => {
    for (const p of product.pieces) {
      const outline = pieceGeometry(p).outline.polylines;
      const rect = pieceTextureRect(p, DEFAULT_TEXTURE_SIZE);
      for (const [u, v] of uvsOf(p.mesh)) {
        const point = uvToPiece(p, { u, v });
        const inside = isInsidePiece(p, point) || distanceToPolylines(outline, point) <= 0.25;
        expect(inside, `${p.mesh} UV (${u}, ${v}) is outside the "${p.id}" outline`).toBe(true);
        expect(u * DEFAULT_TEXTURE_SIZE).toBeGreaterThanOrEqual(rect.x - 0.01);
        expect(u * DEFAULT_TEXTURE_SIZE).toBeLessThanOrEqual(rect.x + rect.width + 0.01);
      }
    }
  });

  it("covers its piece: the mesh reaches every edge of the outline's box", () => {
    for (const p of product.pieces) {
      const points = uvsOf(p.mesh).map(([u, v]) => uvToPiece(p, { u, v }));
      expect(Math.min(...points.map((q) => q.x))).toBeCloseTo(0, 1);
      expect(Math.max(...points.map((q) => q.x))).toBeCloseTo(p.width, 1);
      expect(Math.min(...points.map((q) => q.y))).toBeCloseTo(0, 1);
      expect(Math.max(...points.map((q) => q.y))).toBeCloseTo(p.height, 1);
    }
  });

  it("maps a hit anywhere on a piece's mesh back to that piece (pointer to piece millimetres)", () => {
    for (const p of product.pieces) {
      for (const [u, v] of uvsOf(p.mesh)) {
        const hit = pieceAtMeshUv(product, p.mesh, { u, v });
        expect(hit?.piece.id, `${p.mesh} at (${u}, ${v})`).toBe(p.id);
      }
    }
  });

  it("packs the pieces without overlap, with room for the texture's bleed between and round them", () => {
    const rects = product.pieces.map((p) => ({ id: p.id, ...p.uv }));
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

describe("stand-in T-shirt: colour zones and the texture", () => {
  it("has the zones the brief asks for: body front, body back, sleeves, neck band, and two inside pieces", () => {
    expect(product.zones.map((z) => z.id).sort()).toEqual(["body_back", "body_front", "neck_band", "side_panels", "sleeve_ends", "sleeves"]);
    expect(piece("front").zone).toBe("body_front");
    expect(piece("back").zone).toBe("body_back");
    for (const id of ["neck_band_back", "neck_band_left", "neck_band_right"]) expect(piece(id).zone).toBe("neck_band");
    // Side panels: on both sides of front and back, below the armhole.
    for (const id of ["front", "back"]) {
      const p = piece(id);
      expect(zoneAtPiecePoint(p, { x: 20, y: p.height - 100 })).toBe("side_panels");
      expect(zoneAtPiecePoint(p, { x: p.width - 20, y: p.height - 100 })).toBe("side_panels");
      expect(zoneAtPiecePoint(p, { x: p.width / 2, y: p.height - 100 })).toBe(p.zone);
    }
    // Sleeve ends: a band along the hem.
    for (const id of ["sleeve_left", "sleeve_right"]) {
      const p = piece(id);
      expect(zoneAtPiecePoint(p, { x: p.width / 2, y: p.height - 10 })).toBe("sleeve_ends");
      expect(zoneAtPiecePoint(p, { x: p.width / 2, y: p.height - 60 })).toBe("sleeves");
    }
  });

  it("shows every colour zone somewhere on the model", () => {
    const seen = new Set<string>();
    for (const p of product.pieces) {
      for (const [u, v] of uvsOf(p.mesh)) {
        const cu = p.uv.x + p.uv.width / 2;
        const cv = p.uv.y + p.uv.height / 2;
        const hit = zoneAtUv(product, { u: u + (cu - u) * 0.001, v: v + (cv - v) * 0.001 });
        if (hit) seen.add(hit.zone);
      }
    }
    expect([...seen].sort()).toEqual(product.zones.map((z) => z.id).sort());
  });

  it("does not bleed: every texel the model samples (bilinear, 256 px texture) has its own piece's colours", () => {
    const colours: Record<string, string> = {
      body_front: "#FF0000",
      body_back: "#00FF00",
      side_panels: "#0000FF",
      sleeves: "#FFFF00",
      sleeve_ends: "#FF00FF",
      neck_band: "#00FFFF",
    };
    let design = createDesign(product);
    design = { ...design, zones: Object.fromEntries(Object.entries(colours).map(([zone, hex]) => [zone, { id: `test-${zone}`, hex }])) };
    const size = 256;
    const ctx = new RasterContext(size, size);
    drawPatternTexture(ctx, product, design, { size });
    for (const p of product.pieces) {
      const allowed = new Set([p.zone, ...p.regions.map((r) => r.zone)].map((z) => colours[z]!));
      for (const [u, v] of uvsOf(p.mesh)) {
        // Bilinear filtering reads the four texels round the sample point.
        const x = u * size - 0.5;
        const y = v * size - 0.5;
        for (const [tx, ty] of [
          [Math.floor(x), Math.floor(y)],
          [Math.floor(x) + 1, Math.floor(y)],
          [Math.floor(x), Math.floor(y) + 1],
          [Math.floor(x) + 1, Math.floor(y) + 1],
        ] as const) {
          const colour = ctx.pixel(tx, ty);
          expect(allowed.has(colour), `${p.id} samples ${colour} at texel (${tx}, ${ty})`).toBe(true);
        }
      }
    }
  });
});
