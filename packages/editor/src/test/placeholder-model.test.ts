import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO, type Document } from "@gltf-transform/core";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPlaceholderProduct } from "./fixtures";
import { isInsidePiece, pieceGeometry, uvToPiece, zoneAtUv } from "../design/pattern";
import { pieceAtMeshUv } from "../design/placement";
import { distanceToPolylines } from "../design/svg-path";
import { DEFAULT_TEXTURE_SIZE, pieceTextureRect } from "../texture/pattern-texture";

// The product definition is data and the GLB is a file. These tests check that
// they describe the same thing, so a real model can replace the placeholder
// by changing those two files only.

const root = resolve(import.meta.dirname, "../..");
const product = loadPlaceholderProduct();
const glbPath = resolve(root, "samples/models/placeholder-jersey.glb");

let doc: Document;
beforeAll(async () => {
  doc = await new NodeIO().readBinary(readFileSync(glbPath));
});

/** Every TEXCOORD_0 of the mesh named for this piece, as [u, v] pairs. */
function uvsOf(meshName: string): Array<[number, number]> {
  const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === meshName);
  expect(mesh, `mesh "${meshName}"`).toBeDefined();
  const out: Array<[number, number]> = [];
  for (const primitive of mesh!.listPrimitives()) {
    const uv = primitive.getAttribute("TEXCOORD_0")?.getArray();
    expect(uv, `UVs of "${meshName}"`).toBeDefined();
    for (let i = 0; i < uv!.length; i += 2) out.push([uv![i]!, uv![i + 1]!]);
  }
  return out;
}

describe("placeholder jersey model", () => {
  it("is small", () => {
    expect(statSync(glbPath).size).toBeLessThan(500_000);
  });

  it("is served from the URL named in the product definition", () => {
    expect(product.model.url).toBe("/models/placeholder-jersey.glb");
  });

  it("has a mesh and a node for every pattern piece", () => {
    const meshes = new Set(doc.getRoot().listMeshes().map((m) => m.getName()));
    const nodes = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
    for (const piece of product.pieces) {
      expect(meshes, `mesh for piece "${piece.id}"`).toContain(piece.mesh);
      expect(nodes, `node for piece "${piece.id}"`).toContain(piece.mesh);
    }
  });

  it("holds no textures or images: the colours come from the design, drawn at run time", () => {
    expect(doc.getRoot().listTextures()).toEqual([]);
  });

  it("keeps every mesh's UVs inside its piece's UV rectangle", () => {
    const eps = 1e-4;
    for (const piece of product.pieces) {
      for (const [u, v] of uvsOf(piece.mesh)) {
        expect(u).toBeGreaterThanOrEqual(piece.uv.x - eps);
        expect(u).toBeLessThanOrEqual(piece.uv.x + piece.uv.width + eps);
        expect(v).toBeGreaterThanOrEqual(piece.uv.y - eps);
        expect(v).toBeLessThanOrEqual(piece.uv.y + piece.uv.height + eps);
      }
    }
  });

  it("keeps every mesh's UVs inside its own piece's outline (the panel's area in the texture)", () => {
    // Vertices on the edge of the piece lie on the outline; allow a quarter millimetre for float precision.
    const toleranceMm = 0.25;
    for (const piece of product.pieces) {
      const outline = pieceGeometry(piece).outline.polylines;
      const rect = pieceTextureRect(piece, DEFAULT_TEXTURE_SIZE);
      const uvs = uvsOf(piece.mesh);
      expect(uvs.length).toBeGreaterThan(0);
      for (const [u, v] of uvs) {
        const point = uvToPiece(piece, { u, v });
        const inside = isInsidePiece(piece, point) || distanceToPolylines(outline, point) <= toleranceMm;
        expect(inside, `${piece.mesh} UV (${u}, ${v}) is outside the "${piece.id}" outline`).toBe(true);
        // And so inside the piece's pixel rectangle of the texture.
        expect(u * DEFAULT_TEXTURE_SIZE).toBeGreaterThanOrEqual(rect.x - 0.01);
        expect(u * DEFAULT_TEXTURE_SIZE).toBeLessThanOrEqual(rect.x + rect.width + 0.01);
      }
    }
  });

  it("covers its piece: the mesh reaches every edge of the outline's box", () => {
    for (const piece of product.pieces) {
      const points = uvsOf(piece.mesh).map(([u, v]) => uvToPiece(piece, { u, v }));
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(0, 0);
      expect(Math.max(...xs)).toBeCloseTo(piece.width, 0);
      expect(Math.min(...ys)).toBeCloseTo(0, 0);
      expect(Math.max(...ys)).toBeCloseTo(piece.height, 0);
    }
  });

  it("shows every colour zone somewhere on the model", () => {
    const seen = new Set<string>();
    for (const piece of product.pieces) {
      for (const [u, v] of uvsOf(piece.mesh)) {
        // Nudge towards the piece's centre so edge vertices count as inside.
        const cu = piece.uv.x + piece.uv.width / 2;
        const cv = piece.uv.y + piece.uv.height / 2;
        const hit = zoneAtUv(product, { u: u + (cu - u) * 0.001, v: v + (cv - v) * 0.001 });
        if (hit) seen.add(hit.zone);
      }
    }
    expect([...seen].sort()).toEqual(product.zones.map((z) => z.id).sort());
  });

  it("a hit anywhere on a piece's mesh maps back to that piece (pointer to piece millimetres)", () => {
    for (const piece of product.pieces) {
      for (const [u, v] of uvsOf(piece.mesh)) {
        const hit = pieceAtMeshUv(product, piece.mesh, { u, v });
        expect(hit?.piece.id, `${piece.mesh} at (${u}, ${v})`).toBe(piece.id);
        expect(hit!.point.x).toBeGreaterThanOrEqual(-0.5);
        expect(hit!.point.x).toBeLessThanOrEqual(piece.width + 0.5);
      }
    }
  });

  it("has no overlapping UV rectangles between pattern pieces", () => {
    const rects = product.pieces.map((p) => ({ id: p.id, ...p.uv }));
    for (const a of rects) {
      for (const b of rects) {
        if (a.id >= b.id) continue;
        const overlap =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});
