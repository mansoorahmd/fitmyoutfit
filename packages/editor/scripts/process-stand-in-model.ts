// Makes the editor's stand-in T-shirt from a CLO garment export:
//   samples/models/stand-in-tshirt.glb      (the model)
//   samples/products/stand-in-tshirt.json   (its product definition: pieces, outlines, UV layout, colour zones)
//
// Source, licence and the mapping from source meshes to pattern pieces are data,
// in samples/models/stand-in-tshirt.source.json. The 17.5 MB source file is not
// in the repository; download it from the URL there and check its SHA-256.
//
// Usage (from packages/editor):
//   npm run process:stand-in -- <path to shirt.glb>
//
// The source file is read as data only (JSON and binary buffers); nothing in
// it is run. What the script does, per pattern piece (one mesh in the source):
// 1. finds the outer surface: CLO exports cloth with thickness, as two layers
//    and an edge strip. Rays cast from each layer, on both sides, show which
//    side faces open space (sideHitRates in model-prep/mesh3d.ts);
// 2. keeps only that surface, wound counter-clockwise seen from outside;
// 3. reads the flat piece from the UVs, which CLO writes in millimetres of the
//    flat pattern, and puts it in the editor's piece frame (X right, Y down,
//    seen from outside, origin at the top-left corner; model-prep/frame.ts);
// 4. traces the piece's outline from the UV mesh's boundary (model-prep/outline.ts)
//    and builds the colour-zone bands from it (model-prep/regions.ts);
// then, for all pieces:
// 5. packs the pieces into one texture at one scale (model-prep/packing.ts),
//    writes the product definition and validates it;
// 6. sets every vertex's UV from its piece millimetres through the product
//    definition (pieceToUv), so model and product cannot disagree;
// 7. smooths normals across the seams and bakes ambient occlusion for both
//    sides of the cloth (stored as the custom attribute _OCCLUSION);
// 8. writes a GLB with one plain material, no textures, 16-bit indices.

import { Document, NodeIO } from "@gltf-transform/core";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductDefinition } from "../src/design/validate.js";
import { pieceToUv } from "../src/design/pattern.js";
import type { ColorRef, ProductDefinition } from "../src/design/schema.js";
import type { PathPoint } from "../src/design/svg-path.js";
import { applyFrame, pieceFrame } from "./model-prep/frame.js";
import { readAccessor, readGlb, worldMatrices } from "./model-prep/glb.js";
import {
  bakeOcclusion,
  faceNormal,
  seamSmoothNormals,
  shareAcrossSeams,
  sideHitRates,
  smoothOverMesh,
  TriangleGrid,
  weldSeams,
  type MeshData,
} from "./model-prep/mesh3d.js";
import { boundaryLoops, bounds, polygonToSvgPath, roundTo, simplifyClosed } from "./model-prep/outline.js";
import { DEFAULT_PACK_OPTIONS, packPieces } from "./model-prep/packing.js";
import { edgeBandPath, type BandEdge } from "./model-prep/regions.js";

interface PieceConfig {
  id: string;
  name: string;
  sourceMesh: string;
  zone: string;
  bands: Array<{ zone: string; edge: BandEdge; width: number }>;
}
interface Config {
  source: { title: string; author: string; url: string; licence: string; copyright: string; bytes: number; sha256: string };
  output: { model: string; modelUrl: string; product: string };
  product: { id: string; name: string; palette: { id: string; version: number } };
  outlineToleranceMm: number;
  pieces: PieceConfig[];
  zones: Array<{ id: string; name: string; defaultColor: ColorRef }>;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, "samples/models/stand-in-tshirt.source.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as Config;

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error(`Usage: npm run process:stand-in -- <path to ${config.source.url} shirt.glb>`);
  process.exit(2);
}
const bytes = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== config.source.sha256) {
  throw new Error(
    `The source file's SHA-256 is ${sha256}, not ${config.source.sha256} as recorded in ${configPath}. ` +
      "This script was checked against that exact file; review the mapping before using another one.",
  );
}
console.log(`Source: ${sourcePath} (${bytes.length} bytes, SHA-256 ${sha256})`);

// The source is read with the small reader in model-prep/glb.ts: CLO marks KHR_texture_transform
// as required, which glTF-Transform's core refuses without its extensions package, and none of
// the source's materials or textures are kept anyway.
const source = readGlb(new Uint8Array(bytes));
const sourceWorld = worldMatrices(source.json);

/** Applies a column-major 4x4 matrix to a point. */
function transformPoint(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number] {
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}

interface Surface {
  /** World positions of every vertex of the source mesh (metres). */
  positions: Float64Array;
  /** Source UVs of every vertex (mm). */
  uvs: Float64Array;
  /** Triangles of this primitive, as the source winds them. */
  indices: Uint32Array;
  uvArea: number;
}

/** The index of the one node that carries the mesh named `meshName`. */
function findNode(meshName: string): number {
  const nodes = (source.json.nodes ?? []).flatMap((n, i) => (n.mesh !== undefined && source.json.meshes?.[n.mesh]?.name === meshName ? [i] : []));
  if (nodes.length !== 1) throw new Error(`expected one node with mesh "${meshName}" in the source, found ${nodes.length}`);
  return nodes[0]!;
}

function surfacesOf(nodeIndex: number): Surface[] {
  const node = source.json.nodes![nodeIndex]!;
  const matrix = sourceWorld.get(nodeIndex);
  if (!matrix) throw new Error(`node "${node.name}" is not in the source's scene`);
  return source.json.meshes![node.mesh!]!.primitives.map((prim) => {
    if ((prim.mode ?? 4) !== 4) throw new Error(`a primitive of "${node.name}" is not a triangle list`);
    if (prim.attributes.POSITION === undefined || prim.attributes.TEXCOORD_0 === undefined || prim.indices === undefined) {
      throw new Error(`a primitive of "${node.name}" has no positions, UVs or indices`);
    }
    const pos = readAccessor(source, prim.attributes.POSITION);
    const uv = readAccessor(source, prim.attributes.TEXCOORD_0);
    const idx = readAccessor(source, prim.indices);
    if (pos.size !== 3 || uv.size !== 2 || idx.size !== 1 || uv.count !== pos.count || idx.count % 3 !== 0) {
      throw new Error(`a primitive of "${node.name}" has unexpected accessor shapes`);
    }
    const positions = new Float64Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      positions.set(transformPoint(matrix, pos.values[v * 3]!, pos.values[v * 3 + 1]!, pos.values[v * 3 + 2]!), v * 3);
    }
    const uvs = uv.values;
    const indices = Uint32Array.from(idx.values);
    for (const i of indices) if (i >= pos.count) throw new Error(`a primitive of "${node.name}" has an index out of range`);
    let uvArea = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
      uvArea += Math.abs((uvs[b * 2]! - uvs[a * 2]!) * (uvs[c * 2 + 1]! - uvs[a * 2 + 1]!) - (uvs[b * 2 + 1]! - uvs[a * 2 + 1]!) * (uvs[c * 2]! - uvs[a * 2]!)) / 2;
    }
    return { positions, uvs, indices, uvArea };
  });
}

// ---- 1. The outer surface of each piece ----
const sourcePieces = config.pieces.map((piece) => {
  const surfaces = surfacesOf(findNode(piece.sourceMesh));
  const largest = Math.max(...surfaces.map((s) => s.uvArea));
  // The two cloth layers have the same flat area; the edge strip far less.
  const layers = surfaces.map((s, index) => ({ ...s, index })).filter((s) => s.uvArea >= 0.5 * largest);
  return { piece, surfaces, layers };
});
const candidates: Array<{ pieceIndex: number; layer: number; mesh: MeshData }> = [];
sourcePieces.forEach((sp, pieceIndex) => {
  for (const layer of sp.layers) candidates.push({ pieceIndex, layer: layer.index, mesh: { positions: layer.positions, indices: layer.indices } });
});
const allLayers = new TriangleGrid(candidates.map((c) => c.mesh), 0.02);
const evidence: string[] = [];
// Per piece: the layer and side whose rays hit the least cloth. `flip` when that side is against the winding.
const outerOf = new Map<number, { layer: number; flip: boolean; rate: number }>();
candidates.forEach((c, meshIndex) => {
  const rates = sideHitRates(allLayers, meshIndex, c.mesh, { samples: 400, maxDistance: 1, offset: 0.0001, seed: 7 + meshIndex });
  const rate = Math.min(rates.front, rates.back);
  const name = config.pieces[c.pieceIndex]!.id;
  evidence.push(`${name} primitive ${c.layer}: rays hit cloth ${(rates.front * 100).toFixed(1)}% along its winding normal, ${(rates.back * 100).toFixed(1)}% against it`);
  if (rate < (outerOf.get(c.pieceIndex)?.rate ?? Infinity)) outerOf.set(c.pieceIndex, { layer: c.layer, flip: rates.back < rates.front, rate });
});

// ---- 2. and 3. Keep the outer surface, in the piece frame ----
interface Piece3D {
  config: PieceConfig;
  positions: Float64Array;
  /** Piece millimetres per vertex, origin at the top-left corner. */
  points: PathPoint[];
  indices: Uint32Array;
  width: number;
  height: number;
  outline: PathPoint[];
  /** The vertices on the piece's edge, in order. */
  boundary: number[];
  sourceTriangles: number;
  outerLayer: number;
  flipped: boolean;
  mirror: boolean;
  halfTurn: boolean;
}
const pieces3d: Piece3D[] = sourcePieces.map((sp, pieceIndex) => {
  const choice = outerOf.get(pieceIndex)!;
  const surface = sp.surfaces[choice.layer]!;
  // Compact to the vertices this surface uses.
  const remap = new Map<number, number>();
  const used: number[] = [];
  for (const v of surface.indices) {
    if (!remap.has(v)) {
      remap.set(v, used.length);
      used.push(v);
    }
  }
  const indices = new Uint32Array(surface.indices.length);
  for (let t = 0; t < surface.indices.length; t += 3) {
    const a = remap.get(surface.indices[t]!)!;
    const b = remap.get(surface.indices[t + 1]!)!;
    const c = remap.get(surface.indices[t + 2]!)!;
    indices.set(choice.flip ? [a, c, b] : [a, b, c], t);
  }
  const positions = new Float64Array(used.length * 3);
  const uvs = new Float64Array(used.length * 2);
  used.forEach((v, k) => {
    positions.set(surface.positions.subarray(v * 3, v * 3 + 3), k * 3);
    uvs.set(surface.uvs.subarray(v * 2, v * 2 + 2), k * 2);
  });
  const heights = used.map((_, k) => positions[k * 3 + 1]!);
  const frame = pieceFrame(uvs, heights, indices);
  const framed = used.map((_, k) => applyFrame(frame, uvs[k * 2]!, uvs[k * 2 + 1]!));
  const box = bounds(framed);
  const points = framed.map((p) => ({ x: p.x - box.minX, y: p.y - box.minY }));
  // ---- 4. The outline, from the UV mesh's boundary ----
  const loops = boundaryLoops(indices, (v) => `${uvs[v * 2]!.toFixed(4)},${uvs[v * 2 + 1]!.toFixed(4)}`);
  if (loops.length !== 1) throw new Error(`piece "${sp.piece.id}" has ${loops.length} boundary loops; expected one (no holes)`);
  const width = Math.ceil((box.maxX - box.minX) * 100) / 100;
  const height = Math.ceil((box.maxY - box.minY) * 100) / 100;
  const outline = simplifyClosed(
    loops[0]!.map((v) => points[v]!),
    config.outlineToleranceMm,
  ).map((p) => ({ x: Math.min(width, Math.max(0, roundTo(p.x, 2))), y: Math.min(height, Math.max(0, roundTo(p.y, 2))) }));
  return {
    config: sp.piece,
    positions,
    points,
    indices,
    width,
    height,
    outline,
    boundary: loops[0]!,
    sourceTriangles: surface.indices.length / 3,
    outerLayer: choice.layer,
    flipped: choice.flip,
    mirror: frame.mirror,
    halfTurn: frame.halfTurn,
  };
});

// ---- 5. Pack, write and validate the product definition ----
// Gap and border leave room for the texture's bleed round every piece (see packing.ts).
const packed = packPieces(
  pieces3d.map((p) => ({ id: p.config.id, width: p.width, height: p.height })),
  DEFAULT_PACK_OPTIONS,
);
const productJson = {
  schemaVersion: 1,
  id: config.product.id,
  name: config.product.name,
  model: { url: config.output.modelUrl, format: "glb" },
  palette: config.product.palette,
  pieces: pieces3d.map((p) => {
    const rect = packed.rects.get(p.config.id)!;
    return {
      id: p.config.id,
      name: p.config.name,
      mesh: p.config.id,
      width: p.width,
      height: p.height,
      uv: {
        x: roundTo(rect.x, 9),
        y: roundTo(rect.y, 9),
        width: roundTo(p.width * packed.scale, 12),
        height: roundTo(p.height * packed.scale, 12),
      },
      outline: polygonToSvgPath(p.outline, 2),
      zone: p.config.zone,
      regions: p.config.bands.map((band) => ({ zone: band.zone, path: edgeBandPath(p.outline, band) })),
    };
  }),
  zones: config.zones,
};
const checked = validateProductDefinition(productJson);
if (!checked.ok) throw new Error(`The generated product definition is invalid:\n${checked.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
const product: ProductDefinition = checked.value;

// ---- 6. UVs from piece millimetres, through the product definition ----
const uvArrays = pieces3d.map((p) => {
  const piece = product.pieces.find((q) => q.id === p.config.id)!;
  const out = new Float32Array(p.points.length * 2);
  p.points.forEach((point, k) => {
    const uv = pieceToUv(piece, point);
    out[k * 2] = uv.u;
    out[k * 2 + 1] = uv.v;
  });
  return out;
});

// Centre the garment: X and Z on its middle, its lowest point at Y = 0.
const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
for (const p of pieces3d) {
  for (let v = 0; v < p.positions.length / 3; v++) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, p.positions[v * 3 + a]!);
      hi[a] = Math.max(hi[a]!, p.positions[v * 3 + a]!);
    }
  }
}
const offset = [-(lo[0]! + hi[0]!) / 2, -lo[1]!, -(lo[2]! + hi[2]!) / 2];
const meshes: MeshData[] = pieces3d.map((p) => {
  const positions = new Float32Array(p.positions.length);
  for (let k = 0; k < positions.length; k++) positions[k] = p.positions[k]! + offset[k % 3]!;
  return { positions, indices: Uint16Array.from(p.indices) };
});
for (const m of meshes) if (m.positions.length / 3 > 65535) throw new Error("a piece has more than 65535 vertices; 16-bit indices are not enough");

// ---- 7. Seams, normals across them, ambient occlusion ----
// Sewn seams in the source meet with matching vertices up to 0.5 mm apart: weld them (0.8 mm),
// so no gap shows along a seam, then smooth the normals across the welded seams.
const welded = weldSeams(meshes, pieces3d.map((p) => p.boundary), 0.0008);
console.log(`Welded ${welded.groups} seam vertex groups; the largest move was ${(welded.maxMove * 1000).toFixed(3)} mm`);
const normals = seamSmoothNormals(meshes, 0.0001, 60);
const outerGrid = new TriangleGrid(meshes, 0.015);
console.log("Baking ambient occlusion...");
const started = Date.now();
const baked = meshes.map((m, k) => bakeOcclusion(outerGrid, m, normals[k]!, { rays: 96, maxDistance: 0.35, offset: 0.0005, seed: 101 + k }));
// Take the sampling noise out: smooth over each piece, then even out the welded seams.
const outer = baked.map((b, k) => smoothOverMesh(meshes[k]!.indices, b.outer, 4));
const inner = baked.map((b, k) => smoothOverMesh(meshes[k]!.indices, b.inner, 4));
shareAcrossSeams(meshes, outer);
shareAcrossSeams(meshes, inner);
const occlusion = meshes.map((_, k) => ({ outer: outer[k]!, inner: inner[k]! }));
console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)} s`);

// ---- 8. Write the GLB ----
const doc = new Document();
doc.getRoot().getAsset().copyright =
  `${config.source.title} by ${config.source.author}, ${config.source.copyright}, ${config.source.licence} License, ${config.source.url} . ` +
  "Processed for FitMyOutfit by packages/editor/scripts/process-stand-in-model.ts: outer cloth surface only, textures and materials removed, UVs repacked, normals and ambient occlusion recomputed.";
doc.getRoot().getAsset().generator = "FitMyOutfit packages/editor/scripts/process-stand-in-model.ts (glTF-Transform)";
const buffer = doc.createBuffer();
// One plain material: the editor draws the colours into a texture at run time; the file holds none.
const fabric = doc.createMaterial("fabric").setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.92).setDoubleSided(true);
const scene = doc.createScene(config.product.id);
const garment = doc.createNode(config.product.id);
scene.addChild(garment);
pieces3d.forEach((p, k) => {
  const name = p.config.id;
  const mesh = meshes[k]!;
  const occ = occlusion[k]!;
  const occData = new Uint16Array(occ.outer.length * 2);
  for (let v = 0; v < occ.outer.length; v++) {
    occData[v * 2] = Math.round(occ.outer[v]! * 65535);
    occData[v * 2 + 1] = Math.round(occ.inner[v]! * 65535);
  }
  const accessor = (type: "VEC2" | "VEC3" | "SCALAR", array: Float32Array | Uint16Array, semantic: string) =>
    doc.createAccessor(`${name}_${semantic}`).setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", mesh.positions as Float32Array, "position"))
    .setAttribute("NORMAL", accessor("VEC3", normals[k]!, "normal"))
    .setAttribute("TEXCOORD_0", accessor("VEC2", uvArrays[k]!, "uv"))
    .setAttribute("_OCCLUSION", accessor("VEC2", occData, "occlusion").setNormalized(true))
    .setIndices(accessor("SCALAR", mesh.indices as Uint16Array, "indices"))
    .setMaterial(fabric);
  garment.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
});

const modelPath = resolve(root, config.output.model);
const productPath = resolve(root, config.output.product);
await new NodeIO().write(modelPath, doc);
writeFileSync(productPath, `${JSON.stringify(productJson, null, 2)}\n`);

// ---- Report ----
console.log("\nOuter surface (lower hit rate = faces open space):");
for (const line of evidence) console.log(`  ${line}`);
console.log(`\nOne scale for every piece: ${packed.scale} UV per mm = ${(packed.scale * 2048).toFixed(3)} texture pixels per mm at 2048 px`);
let triangles = 0;
for (const p of pieces3d) {
  const tris = p.indices.length / 3;
  triangles += tris;
  let area3d = 0;
  let areaFlat = 0;
  for (let t = 0; t < tris; t++) {
    const n = faceNormal({ positions: p.positions, indices: p.indices }, t);
    area3d += Math.hypot(n[0], n[1], n[2]) / 2;
    const [a, b, c] = [p.points[p.indices[t * 3]!]!, p.points[p.indices[t * 3 + 1]!]!, p.points[p.indices[t * 3 + 2]!]!];
    areaFlat += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  }
  console.log(
    `  ${p.config.id.padEnd(16)} ${p.width.toFixed(1).padStart(6)} x ${p.height.toFixed(1).padStart(6)} mm, ${String(tris).padStart(5)} triangles ` +
      `(of ${p.sourceTriangles} in source primitive ${p.outerLayer}${p.flipped ? ", winding flipped" : ""}), outline ${p.outline.length} points, ` +
      `area flat ${(areaFlat / 100).toFixed(0)} cm2, on the model ${(area3d * 1e4).toFixed(0)} cm2${p.mirror ? ", mirrored" : ""}${p.halfTurn ? ", turned" : ""}`,
  );
}
console.log(`\nWrote ${modelPath} (${statSync(modelPath).size} bytes, ${triangles} triangles)`);
console.log(`Wrote ${productPath}`);
