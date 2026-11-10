import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { loadPlaceholderProduct } from "./fixtures";

// The product definition is data and the GLB is a file. These tests check that
// they describe the same thing, so a real model can replace the placeholder
// by changing those two files only.

const root = resolve(import.meta.dirname, "../..");
const product = loadPlaceholderProduct();
const glbPath = resolve(root, "samples/models/placeholder-jersey.glb");

describe("placeholder jersey model", () => {
  it("is small", () => {
    expect(statSync(glbPath).size).toBeLessThan(500_000);
  });

  it("is served from the URL named in the product definition", () => {
    expect(product.model.url).toBe("/models/placeholder-jersey.glb");
  });

  it("has a mesh for every pattern piece and a material for every zone", async () => {
    const doc = await new NodeIO().readBinary(readFileSync(glbPath));
    const meshes = new Set(doc.getRoot().listMeshes().map((m) => m.getName()));
    const materials = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
    for (const piece of product.pieces) {
      expect(meshes, `mesh for piece "${piece.id}"`).toContain(piece.mesh);
    }
    for (const zone of product.zones) {
      for (const material of zone.materials) {
        expect(materials, `material for zone "${zone.id}"`).toContain(material);
      }
    }
  });

  it("keeps every mesh's UVs inside its piece's UV rectangle", async () => {
    const doc = await new NodeIO().readBinary(readFileSync(glbPath));
    const eps = 1e-4;
    for (const piece of product.pieces) {
      const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === piece.mesh);
      expect(mesh).toBeDefined();
      for (const primitive of mesh!.listPrimitives()) {
        const uv = primitive.getAttribute("TEXCOORD_0")?.getArray();
        expect(uv, `UVs of "${piece.mesh}"`).toBeDefined();
        for (let i = 0; i < uv!.length; i += 2) {
          expect(uv![i]!).toBeGreaterThanOrEqual(piece.uv.x - eps);
          expect(uv![i]!).toBeLessThanOrEqual(piece.uv.x + piece.uv.width + eps);
          expect(uv![i + 1]!).toBeGreaterThanOrEqual(piece.uv.y - eps);
          expect(uv![i + 1]!).toBeLessThanOrEqual(piece.uv.y + piece.uv.height + eps);
        }
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
