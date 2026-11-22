// Makes the editor's stand-in garments from downloaded garment exports, each
// driven by a source record (data) in samples/models/*.source.json:
//   stand-in-tshirt.source.json  -> samples/models/stand-in-tshirt.glb, samples/products/stand-in-tshirt.json
//   stand-in-jersey.source.json  -> samples/models/stand-in-jersey.glb, samples/products/stand-in-jersey.json
//
// Source, licence and the mapping from the source's geometry to pattern pieces
// and colour zones are data in the record. The source files are not in the
// repository; download them from the URLs there. The script picks the record
// whose SHA-256 matches the file, and refuses a file that matches none.
//
// Usage (from packages/editor):
//   npm run process:stand-in -- <path to the downloaded .glb>
//
// The source file is read as data only (JSON and binary buffers); nothing in
// it is run. What the script does, per pattern piece:
// 1. finds the piece's copies in the source and keeps the outer surface. Cloth
//    exports have thickness: two layers a fabric's thickness apart plus edge
//    strips. A piece is either a whole source mesh (record field `sourceMesh`;
//    its primitives are the layers) or a UV island found by a point inside it
//    (`island`; every shell of the record's `input.sourceMeshes` whose UV
//    triangles hold the point is a layer, model-prep/shells.ts). Edge strips
//    have no UV area and are never candidates. Rays cast from each layer, on
//    both sides, show which side faces open space (sideHitRates in
//    model-prep/mesh3d.ts);
// 2. keeps only that surface, wound counter-clockwise seen from outside, its
//    positions through the node transforms in metres (glb.ts worldPositions);
// 3. reads the flat piece from the UVs in millimetres. CLO writes millimetres;
//    a layout in 0 to 1 (`input.uv: "normalised"`) is measured against the 3D
//    surface (model-prep/scale.ts): one scale if the islands agree, else one
//    per island. Then puts it in the editor's piece frame (X right, Y down,
//    seen from outside, origin at the top-left corner; model-prep/frame.ts);
// 4. traces the piece's outline from the UV mesh's boundary (model-prep/outline.ts)
//    and builds the colour-zone bands from it (model-prep/regions.ts);
// then, for all pieces:
// 5. packs the pieces into one texture at one scale (model-prep/packing.ts),
//    each in its own area (also where the source's areas overlapped),
//    writes the product definition and validates it;
// 6. sets every vertex's UV from its piece millimetres through the product
//    definition (pieceToUv), so model and product cannot disagree;
// 7. checks the orientation, welds the seams, smooths normals across them and
//    bakes ambient occlusion for both sides of the cloth (_OCCLUSION);
// 8. writes a GLB with one plain material, no textures, 16-bit indices: one
//    mesh per piece, or all pieces in one mesh (`output.mesh`, one draw call).

import { Document, NodeIO } from "@gltf-transform/core";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductDefinition } from "../src/design/validate.js";
import { pieceToUv } from "../src/design/pattern.js";
import { PRODUCT_SCHEMA_VERSION, type ColorRef, type PlacementPreset, type ProductDefinition, type TeamColors } from "../src/design/schema.js";
import type { PathPoint } from "../src/design/svg-path.js";
import { centroid, mergeParts, orientationProblems, type MeshPart } from "./model-prep/assemble.js";
import { applyFrame, pieceFrame } from "./model-prep/frame.js";
import { readAccessor, readGlb, worldMatrices, worldPositions } from "./model-prep/glb.js";
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
import { KHRMeshQuantization, quantizationFrame, quantizeNormals, quantizePositions, quantizeUvs } from "./model-prep/quantize.js";
import { decideUvScale, medianEdgeRatio } from "./model-prep/scale.js";
import { isEdgeStrip, shellHoldsUv, splitShells, uvBoxesOverlap, type ShellStats } from "./model-prep/shells.js";

interface PieceConfig {
  id: string;
  name: string;
  /** The whole source mesh (node) that holds the piece; its primitives are the cloth's layers. */
  sourceMesh?: string;
  /** Or: a UV point inside the piece's island, in the source's UVs. */
  island?: [number, number];
  zone: string;
  bands: Array<{ zone: string; edge: BandEdge; width: number }>;
}
interface Config {
  source: { title: string; author: string; url: string; licence: string; bytes: number; sha256: string };
  input?: {
    /** Metres per unit of the source's positions, after its node transforms (default 1). */
    metresPerUnit?: number;
    /** "mm" (default): UVs are millimetres of the flat pattern. "normalised": a 0 to 1 layout, measured against the 3D surface. */
    uv?: "mm" | "normalised";
    /** The source meshes islands are looked for in. */
    sourceMeshes?: string[];
    /** How far islands' scales may differ and still count as one scale (default 0.04). */
    scaleTolerance?: number;
  };
  output: {
    model: string;
    modelUrl: string;
    product: string;
    /** Put every piece in one mesh of this name (one draw call). Default: one mesh per piece, named as the piece. */
    mesh?: string;
    /** Integer vertex data (KHR_mesh_quantization, model-prep/quantize.ts): about 40% smaller. */
    quantize?: boolean;
    /**
     * Keep the source's positions (metres, Y up) instead of centring the garment and standing it on Y = 0: a
     * garment simulated on an avatar keeps the avatar's frame, so a body model made from the same avatar lines up.
     */
    keepPosition?: boolean;
    copyright: string;
    generator: string;
  };
  product: { id: string; name: string; palette: { id: string; version: number } };
  /** Team colours a new design starts with (copied into the product definition). */
  teamColors: TeamColors;
  /** The pieces that show the front and the back (thumbnails, the flat view). */
  views: { front: string; back: string };
  /**
   * Placement presets, in the generated pieces' millimetres (copied into the
   * product definition, whose validation checks that each centre lies on its piece).
   */
  placements: PlacementPreset[];
  /** Print areas by piece id, in the generated pieces' millimetres (N6; placeholders until the factories give theirs). */
  printAreas?: Record<string, { x: number; y: number; width: number; height: number }>;
  /** The smallest item per kind, in mm (E3c; placeholders; copied into the product definition). */
  minItemSize?: ProductDefinition["minItemSize"];
  /** G3: the body model this product is shown on (copied into the product definition). */
  body?: ProductDefinition["body"];
  /** Where new logos and free text go first (E3c; copied into the product definition). */
  placementOrder?: ProductDefinition["placementOrder"];
  outlineToleranceMm: number;
  /** How the pieces are packed into the texture (model-prep/packing.ts; default "shelf"). */
  packing?: "shelf" | "skyline" | "best";
  /** Seam vertices of two pieces this close are welded (default 0.8 mm). */
  weldToleranceMm?: number;
  pieces: PieceConfig[];
  zones: Array<{ id: string; name: string; defaultColor: ColorRef }>;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = resolve(root, "samples/models");

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Usage: npm run process:stand-in -- <path to a source .glb named in samples/models/*.source.json>");
  process.exit(2);
}
const bytes = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const records = readdirSync(modelsDir)
  .filter((f) => f.endsWith(".source.json"))
  .map((f) => ({ path: resolve(modelsDir, f), config: JSON.parse(readFileSync(resolve(modelsDir, f), "utf8")) as Config }));
const record = records.find((r) => r.config.source.sha256 === sha256);
if (!record) {
  throw new Error(
    `The source file's SHA-256 is ${sha256}, which no source record in ${modelsDir} names. ` +
      "This script was checked against those exact files; review the mapping before using another one.",
  );
}
const configPath = record.path;
const config = record.config;
console.log(`Source: ${sourcePath} (${bytes.length} bytes, SHA-256 ${sha256})\nRecord: ${configPath}`);
const metresPerUnit = config.input?.metresPerUnit ?? 1;
const normalisedUv = config.input?.uv === "normalised";

// The source is read with the small reader in model-prep/glb.ts: CLO marks KHR_texture_transform
// as required, which glTF-Transform's core refuses without its extensions package, and none of
// the source's materials or textures are kept anyway.
const source = readGlb(new Uint8Array(bytes));
const sourceWorld = worldMatrices(source.json);

interface Surface {
  /** World positions of every vertex of the source mesh (metres). */
  positions: Float64Array;
  /** Source UVs of every vertex (mm, or 0 to 1 for a normalised layout). */
  uvs: Float64Array;
  /** Triangles of this layer, as the source winds them. */
  indices: Uint32Array;
  uvArea: number;
  /** Where it comes from, for the report. */
  label: string;
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
  return source.json.meshes![node.mesh!]!.primitives.map((prim, primIndex) => {
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
    const positions = worldPositions(pos.values, matrix, metresPerUnit);
    const uvs = uv.values;
    const indices = Uint32Array.from(idx.values);
    for (const i of indices) if (i >= pos.count) throw new Error(`a primitive of "${node.name}" has an index out of range`);
    let uvArea = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
      uvArea += Math.abs((uvs[b * 2]! - uvs[a * 2]!) * (uvs[c * 2 + 1]! - uvs[a * 2 + 1]!) - (uvs[b * 2 + 1]! - uvs[a * 2 + 1]!) * (uvs[c * 2]! - uvs[a * 2]!)) / 2;
    }
    return { positions, uvs, indices, uvArea, label: `mesh "${source.json.meshes![node.mesh!]!.name}" primitive ${primIndex}` };
  });
}

// ---- 1. The layers of each piece ----
const evidence: string[] = [];
/** Shells of the record's source meshes (island pieces only): surface layers, edge strips told apart. */
const shellIndex: Array<{ mesh: string; surface: Surface; shell: ShellStats; edge: boolean }> = [];
if (config.pieces.some((p) => p.island)) {
  const meshes = config.input?.sourceMeshes;
  if (!meshes || meshes.length === 0) throw new Error("pieces found by island need input.sourceMeshes");
  // A first estimate of position units per UV unit, only to tell edge strips (no UV area) from layers.
  for (const meshName of meshes) {
    for (const surface of surfacesOf(findNode(meshName))) {
      const shells = splitShells(surface.positions, surface.uvs, surface.indices);
      const estimate = normalisedUv ? 1 : 0.001; // metres per UV unit: a garment pattern is about a metre across; CLO: mm
      let layers = 0;
      let edges = 0;
      for (const shell of shells) {
        const edge = isEdgeStrip(shell, estimate);
        if (edge) edges++;
        else layers++;
        shellIndex.push({ mesh: meshName, surface, shell, edge });
      }
      const triangles = surface.indices.length / 3;
      evidence.push(`${meshName}: ${triangles} triangles in ${shells.length} shells: ${layers} cloth layers, ${edges} edge strips (no UV area)`);
    }
  }
}

function layersOf(piece: PieceConfig): Surface[] {
  if (piece.sourceMesh !== undefined) {
    const surfaces = surfacesOf(findNode(piece.sourceMesh));
    const largest = Math.max(...surfaces.map((s) => s.uvArea));
    // The two cloth layers have the same flat area; the edge strip far less.
    return surfaces.filter((s) => s.uvArea >= 0.5 * largest);
  }
  if (!piece.island) throw new Error(`piece "${piece.id}" names neither a source mesh nor an island`);
  const [u, v] = piece.island;
  const found = shellIndex.filter((s) => !s.edge && shellHoldsUv(s.shell, s.surface.uvs, s.surface.indices, u, v));
  if (found.length === 0) throw new Error(`no cloth layer of the source holds the UV point (${u}, ${v}) of piece "${piece.id}"`);
  return found.map((s) => {
    const indices = new Uint32Array(s.shell.triangles.length * 3);
    s.shell.triangles.forEach((t, k) => indices.set(s.surface.indices.subarray(t * 3, t * 3 + 3), k * 3));
    return { positions: s.surface.positions, uvs: s.surface.uvs, indices, uvArea: s.shell.uvArea, label: `mesh "${s.mesh}", shell with UV winding ${s.shell.uvSignedArea > 0 ? "+" : "-"}` };
  });
}

const sourcePieces = config.pieces.map((piece) => {
  const surfaces = layersOf(piece);
  const layers = surfaces.map((s, index) => ({ ...s, index }));
  return { piece, surfaces, layers };
});
const candidates: Array<{ pieceIndex: number; layer: number; mesh: MeshData }> = [];
sourcePieces.forEach((sp, pieceIndex) => {
  for (const layer of sp.layers) candidates.push({ pieceIndex, layer: layer.index, mesh: { positions: layer.positions, indices: layer.indices } });
});
const allLayers = new TriangleGrid(candidates.map((c) => c.mesh), 0.02);
// Per piece: the layer and side whose rays hit the least cloth. `flip` when that side is against the winding.
const outerOf = new Map<number, { layer: number; flip: boolean; rate: number }>();
candidates.forEach((c, meshIndex) => {
  const rates = sideHitRates(allLayers, meshIndex, c.mesh, { samples: 400, maxDistance: 1, offset: 0.0001, seed: 7 + meshIndex });
  const rate = Math.min(rates.front, rates.back);
  const name = config.pieces[c.pieceIndex]!.id;
  evidence.push(`${name} layer ${c.layer} (${sourcePieces[c.pieceIndex]!.surfaces[c.layer]!.label}): rays hit cloth ${(rates.front * 100).toFixed(1)}% along its winding normal, ${(rates.back * 100).toFixed(1)}% against it`);
  if (rate < (outerOf.get(c.pieceIndex)?.rate ?? Infinity)) outerOf.set(c.pieceIndex, { layer: c.layer, flip: rates.back < rates.front, rate });
});

// ---- 3a. The UV scale (a normalised layout only): from the 3D surface ----
const mmPerUv = new Map<string, number>();
let scaleReport = "UVs are millimetres of the flat pattern (CLO)";
if (normalisedUv) {
  const decision = decideUvScale(
    sourcePieces.map((sp, pieceIndex) => {
      const surface = sp.surfaces[outerOf.get(pieceIndex)!.layer]!;
      const triangles = Array.from({ length: surface.indices.length / 3 }, (_, t) => t);
      let area = 0;
      for (const t of triangles) {
        const n = faceNormal({ positions: surface.positions, indices: surface.indices }, t);
        area += Math.hypot(n[0], n[1], n[2]) / 2;
      }
      // Metres per UV unit, to millimetres.
      return { id: sp.piece.id, ratio: medianEdgeRatio(surface.positions, surface.uvs, surface.indices, triangles) * 1000, weight: area };
    }),
    config.input?.scaleTolerance ?? 0.04,
  );
  for (const [id, scale] of decision.scales) mmPerUv.set(id, scale);
  scaleReport =
    `UV layout measured against the 3D surface: common scale ${decision.common.toFixed(1)} mm per UV unit; ` +
    (decision.oneScale ? "every deciding island agrees, so all use it" : "the islands differ, so each uses its own") +
    `\n  deciding islands: ${decision.deciding.join(", ")}` +
    `\n  per island, on the model relative to the layout: ${[...decision.deviations].map(([id, d]) => `${id} ${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`).join(", ")}`;
}

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
  /** The source UV box (for the report: areas that overlapped). */
  sourceUvBox: { minU: number; minV: number; maxU: number; maxV: number };
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
  const sourceUvBox = { minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity };
  used.forEach((v, k) => {
    positions.set(surface.positions.subarray(v * 3, v * 3 + 3), k * 3);
    uvs.set(surface.uvs.subarray(v * 2, v * 2 + 2), k * 2);
    sourceUvBox.minU = Math.min(sourceUvBox.minU, surface.uvs[v * 2]!);
    sourceUvBox.maxU = Math.max(sourceUvBox.maxU, surface.uvs[v * 2]!);
    sourceUvBox.minV = Math.min(sourceUvBox.minV, surface.uvs[v * 2 + 1]!);
    sourceUvBox.maxV = Math.max(sourceUvBox.maxV, surface.uvs[v * 2 + 1]!);
  });
  // A normalised layout to millimetres (CLO's UVs already are).
  const scale = mmPerUv.get(sp.piece.id);
  if (scale !== undefined) for (let k = 0; k < uvs.length; k++) uvs[k] = uvs[k]! * scale;
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
    sourceUvBox,
  };
});

// ---- 5. Pack, write and validate the product definition ----
// Gap and border leave room for the texture's bleed round every piece (see packing.ts).
const packed = packPieces(
  pieces3d.map((p) => ({ id: p.config.id, width: p.width, height: p.height })),
  config.packing ? { ...DEFAULT_PACK_OPTIONS, method: config.packing } : DEFAULT_PACK_OPTIONS,
);
const meshNameOf = (p: Piece3D) => config.output.mesh ?? p.config.id;
const productJson = {
  schemaVersion: PRODUCT_SCHEMA_VERSION,
  id: config.product.id,
  name: config.product.name,
  model: { url: config.output.modelUrl, format: "glb" },
  ...(config.body ? { body: config.body } : {}),
  palette: config.product.palette,
  teamColors: config.teamColors,
  views: config.views,
  pieces: pieces3d.map((p) => {
    const rect = packed.rects.get(p.config.id)!;
    return {
      id: p.config.id,
      name: p.config.name,
      mesh: meshNameOf(p),
      width: p.width,
      height: p.height,
      uv: {
        x: roundTo(rect.x, 9),
        y: roundTo(rect.y, 9),
        width: roundTo(p.width * packed.scale, 12),
        height: roundTo(p.height * packed.scale, 12),
      },
      outline: polygonToSvgPath(p.outline, 2),
      ...(config.printAreas?.[p.config.id] ? { printArea: config.printAreas[p.config.id] } : {}),
      zone: p.config.zone,
      regions: p.config.bands.map((band) => ({ zone: band.zone, path: edgeBandPath(p.outline, band) })),
    };
  }),
  zones: config.zones,
  placements: config.placements,
  ...(config.minItemSize ? { minItemSize: config.minItemSize } : {}),
  ...(config.placementOrder ? { placementOrder: config.placementOrder } : {}),
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
const offset = config.output.keepPosition ? [0, 0, 0] : [-(lo[0]! + hi[0]!) / 2, -lo[1]!, -(lo[2]! + hi[2]!) / 2];
const meshes: MeshData[] = pieces3d.map((p) => {
  const positions = new Float32Array(p.positions.length);
  for (let k = 0; k < positions.length; k++) positions[k] = p.positions[k]! + offset[k % 3]!;
  return { positions, indices: Uint16Array.from(p.indices) };
});
for (const m of meshes) if (m.positions.length / 3 > 65535) throw new Error("a piece has more than 65535 vertices; 16-bit indices are not enough");

// ---- 7. Orientation, seams, normals across them, ambient occlusion ----
const centreOf = (id: string) => {
  const k = pieces3d.findIndex((p) => p.config.id === id);
  return k === -1 ? undefined : centroid(meshes[k]!.positions);
};
const problems = orientationProblems(
  { front: centreOf("front")!, back: centreOf("back")!, left: centreOf("sleeve_left"), right: centreOf("sleeve_right") },
  [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!],
);
if (problems.length > 0) throw new Error(`The garment does not face the editor's way (Y up, front +Z, wearer's left +X): ${problems.join("; ")}`);
// Sewn seams in the source meet with matching vertices up to 0.5 mm apart: weld them,
// so no gap shows along a seam, then smooth the normals across the welded seams.
const welded = weldSeams(meshes, pieces3d.map((p) => p.boundary), (config.weldToleranceMm ?? 0.8) / 1000);
console.log(`Welded ${welded.groups} seam vertex groups; the largest move was ${(welded.maxMove * 1000).toFixed(3)} mm`);
const normals = seamSmoothNormals(meshes, 0.0001, 60);
const outerGrid = new TriangleGrid(meshes, 0.015);
// No two kept surfaces may lie within 0.2 mm of each other (they would flicker, "z-fighting"): sample each piece both ways.
const closeSurfaces = meshes.flatMap((m, k) => {
  const r = sideHitRates(outerGrid, k, m, { samples: 200, maxDistance: 0.0002, offset: 0.00001, seed: 500 + k });
  return r.front + r.back > 0.02 ? [`${pieces3d[k]!.config.id} (${((r.front + r.back) * 100).toFixed(1)}% of samples)`] : [];
});
if (closeSurfaces.length > 0) throw new Error(`Surfaces lie within 0.2 mm of other cloth and would flicker: ${closeSurfaces.join(", ")}`);
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
doc.getRoot().getAsset().copyright = config.output.copyright;
doc.getRoot().getAsset().generator = config.output.generator;
const buffer = doc.createBuffer();
// One plain material: the editor draws the colours into a texture at run time; the file holds none.
const fabric = doc.createMaterial("fabric").setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.92).setDoubleSided(true);
const scene = doc.createScene(config.product.id);
const garment = doc.createNode(config.product.id);
scene.addChild(garment);
const parts: MeshPart[] = pieces3d.map((p, k) => {
  const occ = occlusion[k]!;
  const occData = new Uint16Array(occ.outer.length * 2);
  for (let v = 0; v < occ.outer.length; v++) {
    occData[v * 2] = Math.round(occ.outer[v]! * 65535);
    occData[v * 2 + 1] = Math.round(occ.inner[v]! * 65535);
  }
  return { positions: meshes[k]!.positions as Float32Array, normals: normals[k]!, uvs: uvArrays[k]!, occlusion: occData, indices: meshes[k]!.indices as Uint16Array };
});
const outputs: Array<{ name: string; part: MeshPart }> = config.output.mesh
  ? [{ name: config.output.mesh, part: mergeParts(parts) }]
  : pieces3d.map((p, k) => ({ name: p.config.id, part: parts[k]! }));
if (config.output.quantize) doc.createExtension(KHRMeshQuantization).setRequired(true);
// One quantization frame for every mesh: the welded seams between pieces stay closed in the integers.
const sharedFrame = config.output.quantize ? quantizationFrame(outputs.map((o) => o.part.positions)) : null;
for (const { name, part } of outputs) {
  if (!(part.indices instanceof Uint16Array)) throw new Error(`mesh "${name}" has more than 65535 vertices; 16-bit indices are not enough`);
  const accessor = (type: "VEC2" | "VEC3" | "SCALAR", array: Float32Array | Uint16Array | Int16Array | Int8Array, semantic: string) =>
    doc.createAccessor(`${name}_${semantic}`).setType(type).setArray(array).setBuffer(buffer);
  const node = doc.createNode(name);
  const prim = doc.createPrimitive();
  if (config.output.quantize) {
    // Integers, turned back into metres by the node's scale and translation (see model-prep/quantize.ts).
    const q = quantizePositions(part.positions, sharedFrame ?? undefined);
    node.setScale([q.scale, q.scale, q.scale]).setTranslation(q.translation);
    prim
      .setAttribute("POSITION", accessor("VEC3", q.values, "position").setNormalized(true))
      .setAttribute("NORMAL", accessor("VEC3", quantizeNormals(part.normals), "normal").setNormalized(true))
      .setAttribute("TEXCOORD_0", accessor("VEC2", quantizeUvs(part.uvs), "uv").setNormalized(true));
  } else {
    prim
      .setAttribute("POSITION", accessor("VEC3", part.positions, "position"))
      .setAttribute("NORMAL", accessor("VEC3", part.normals, "normal"))
      .setAttribute("TEXCOORD_0", accessor("VEC2", part.uvs, "uv"));
  }
  prim
    .setAttribute("_OCCLUSION", accessor("VEC2", part.occlusion, "occlusion").setNormalized(true))
    .setIndices(accessor("SCALAR", part.indices, "indices"))
    .setMaterial(fabric);
  garment.addChild(node.setMesh(doc.createMesh(name).addPrimitive(prim)));
}

const modelPath = resolve(root, config.output.model);
const productPath = resolve(root, config.output.product);
await new NodeIO().registerExtensions([KHRMeshQuantization]).write(modelPath, doc);
writeFileSync(productPath, `${JSON.stringify(productJson, null, 2)}\n`);

// ---- Report ----
console.log("\nSurfaces and outer surface (lower hit rate = faces open space):");
for (const line of evidence) console.log(`  ${line}`);
console.log(`\n${scaleReport}`);
const overlaps: string[] = [];
pieces3d.forEach((a, i) => pieces3d.slice(i + 1).forEach((b) => uvBoxesOverlap(a.sourceUvBox, b.sourceUvBox) && overlaps.push(`${a.config.id} / ${b.config.id}`)));
console.log(`Source UV areas that overlap (each now has its own): ${overlaps.length === 0 ? "none" : overlaps.join(", ")}`);
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
      `(of ${p.sourceTriangles} in source layer ${p.outerLayer}${p.flipped ? ", winding flipped" : ""}), outline ${p.outline.length} points, ` +
      `area flat ${(areaFlat / 100).toFixed(0)} cm2, on the model ${(area3d * 1e4).toFixed(0)} cm2${p.mirror ? ", mirrored" : ""}${p.halfTurn ? ", turned" : ""}`,
  );
}
console.log(`\nWrote ${modelPath} (${statSync(modelPath).size} bytes, ${triangles} triangles, ${outputs.length} draw calls)`);
console.log(`Wrote ${productPath}`);
