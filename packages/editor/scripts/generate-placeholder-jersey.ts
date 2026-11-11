// Generates the PLACEHOLDER jersey model: samples/models/placeholder-jersey.glb
//
// Origin and licence: this model is created entirely by this script
// (procedural geometry, written with @gltf-transform/core). No third-party
// model, texture or file is used or downloaded, so there is nothing to
// attribute. It carries the same licence as the rest of this repository.
//
// It is a stand-in for the real garment models, built FROM the product
// definition (samples/products/placeholder-jersey.json):
// - each pattern piece becomes one mesh, named as the piece's `mesh`;
// - the mesh is the piece's outline wrapped onto a simple body shape: every
//   row of the flat piece becomes a ring (or half ring) whose length equals
//   the row's width in the outline, and points are spread along it by arc
//   length, so the texture is not stretched;
// - every vertex's UV is its own point on the flat piece, mapped linearly
//   into the piece's UV rectangle. So a point in piece millimetres lands at a
//   known place on the garment, and every UV lies inside the piece's outline.
// A real model replaces this file and the product definition JSON; no code
// changes are needed.
//
// Conventions: metres, +Y up, the wearer faces +Z, the wearer's left is +X.
// 1 mm on a piece is 1 mm on the model. UVs follow glTF: origin top-left,
// V down.
//
// Usage: npm run generate:model

import { Document, NodeIO, type Material, type Node } from "@gltf-transform/core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductDefinition } from "../src/design/validate.js";
import { pieceGeometry, pieceToUv } from "../src/design/pattern.js";
import type { PatternPiece } from "../src/design/schema.js";
import type { PathPoint } from "../src/design/svg-path.js";

type Vec3 = [number, number, number];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productPath = resolve(root, "samples/products/placeholder-jersey.json");
const outPath = resolve(root, "samples/models/placeholder-jersey.glb");

const checked = validateProductDefinition(JSON.parse(readFileSync(productPath, "utf8")));
if (!checked.ok) throw new Error(`The product definition is invalid:\n${checked.errors.map((e) => e.message).join("\n")}`);
const product = checked.value;

function pieceForMesh(meshName: string): PatternPiece {
  const piece = product.pieces.find((p) => p.mesh === meshName);
  if (!piece) throw new Error(`Product definition has no piece for mesh "${meshName}"`);
  return piece;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerpTable = (table: ReadonlyArray<readonly [number, number]>, x: number) => {
  if (x <= table[0]![0]) return table[0]![1];
  for (let k = 0; k < table.length - 1; k++) {
    const [x0, y0] = table[k]!;
    const [x1, y1] = table[k + 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return table[table.length - 1]![1];
};

/** Left and right edge (mm) of the piece's outline on the horizontal line at `y` mm. */
function rowSpan(piece: PatternPiece, y: number): [number, number] {
  const xs: number[] = [];
  for (const line of pieceGeometry(piece).outline.polylines) {
    const pts = line.points;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[(k + 1) % pts.length]!;
      if (a.y === b.y) {
        if (Math.abs(a.y - y) < 1e-9) xs.push(a.x, b.x);
      } else if ((y >= a.y && y <= b.y) || (y >= b.y && y <= a.y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
  }
  if (xs.length === 0) throw new Error(`Outline of piece "${piece.id}" has no width at y = ${y} mm`);
  return [Math.min(...xs), Math.max(...xs)];
}

/** Ramanujan's perimeter of an ellipse with semi-axes r and k * r, divided by r. */
const ellipsePerimeterFactor = (k: number) => Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k)));

/**
 * Angle along an ellipse (x = sin(theta), z = k cos(theta)), starting at
 * `from`, at which the arc length is the given fraction of the arc from
 * `from` to `from + span`.
 */
function angleAtArcFraction(fraction: number, k: number, from: number, span: number): number {
  const steps = 512;
  const lengths = [0];
  for (let n = 1; n <= steps; n++) {
    const th = from + (span * (n - 0.5)) / steps;
    lengths.push(lengths[n - 1]! + Math.hypot(Math.cos(th), k * Math.sin(th)) * (span / steps));
  }
  const target = clamp01(fraction) * lengths[steps]!;
  let n = 1;
  while (n < steps && lengths[n]! < target) n++;
  const f = (target - lengths[n - 1]!) / (lengths[n]! - lengths[n - 1]! || 1);
  return from + (span * (n - 1 + f)) / steps;
}

interface Sample {
  position: Vec3;
  /** The point on the flat piece (mm) that this vertex shows. */
  piecePoint: PathPoint;
}

/**
 * A (nu + 1) x (nv + 1) grid: `sample(s, t)` gives the vertex for s across a
 * row (0 to 1) and t down the piece (0 to 1). `axis(t)` is a point inside the
 * body, used to turn normals outwards.
 */
function buildSurface(opts: {
  piece: PatternPiece;
  nu: number;
  nv: number;
  sample: (s: number, t: number) => Sample;
  axis: (t: number) => Vec3;
}) {
  const { piece, nu, nv, sample, axis } = opts;
  const eps = 1e-3;
  const at = (s: number, t: number) => sample(clamp01(s), clamp01(t)).position;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const cols = nu + 1;
  for (let i = 0; i <= nv; i++) {
    const t = i / nv;
    for (let j = 0; j <= nu; j++) {
      const s = j / nu;
      const { position: p, piecePoint } = sample(s, t);
      const dpds = sub(at(s + eps, t), at(s - eps, t));
      const dpdt = sub(at(s, t + eps), at(s, t - eps));
      let n = norm(cross(dpds, dpdt));
      if (dot(n, sub(p, axis(t))) < 0) n = [-n[0], -n[1], -n[2]];
      const uv = pieceToUv(piece, piecePoint);
      positions.push(...p);
      normals.push(...n);
      uvs.push(uv.u, uv.v);
    }
  }
  const indices: number[] = [];
  const vec = (k: number): Vec3 => [positions[k * 3]!, positions[k * 3 + 1]!, positions[k * 3 + 2]!];
  const nrm = (k: number): Vec3 => [normals[k * 3]!, normals[k * 3 + 1]!, normals[k * 3 + 2]!];
  const pushTri = (a: number, b: number, c: number) => {
    const face = cross(sub(vec(b), vec(a)), sub(vec(c), vec(a)));
    if (dot(face, nrm(a)) >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < nu; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      pushTri(a, b, c);
      pushTri(b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

// Torso: front and back pieces share the side seams. Depth to width ratio of
// the body's cross-section, by distance (mm) from the top of the piece.
const TORSO_DEPTH_RATIO: ReadonlyArray<readonly [number, number]> = [
  [0, 0.76],
  [120, 0.62],
  [250, 0.53],
  [700, 0.52],
];
const MM = 0.001;

/** Half-width (m) of the torso at `y` mm down the piece: the half ring's length equals the row's width. */
function torsoRadius(piece: PatternPiece, y: number): { rx: number; k: number } {
  const [xl, xr] = rowSpan(piece, y);
  const k = lerpTable(TORSO_DEPTH_RATIO, y);
  return { rx: (2 * (xr - xl) * MM) / ellipsePerimeterFactor(k), k };
}

/** Half a torso. The front runs from the wearer's right side (-X) round to the left (+X); the back the other way. */
function torsoHalf(meshName: string, side: "front" | "back") {
  const piece = pieceForMesh(meshName);
  const from = side === "front" ? -Math.PI / 2 : Math.PI / 2;
  return buildSurface({
    piece,
    nu: 36,
    nv: 48,
    sample: (s, t) => {
      const y = t * piece.height;
      const [xl, xr] = rowSpan(piece, y);
      const { rx, k } = torsoRadius(piece, y);
      const theta = angleAtArcFraction(s, k, from, Math.PI);
      return {
        position: [rx * Math.sin(theta), (piece.height - y) * MM, k * rx * Math.cos(theta)],
        piecePoint: { x: xl + s * (xr - xl), y },
      };
    },
    axis: (t) => [0, (piece.height - t * piece.height) * MM, 0],
  });
}

const SLEEVE_DEPTH_RATIO = 0.9;
/**
 * A sleeve tube hanging down from its local origin; the outline's row width is
 * the ring's length. `seam` is the angle where the piece's left and right
 * edges meet: under the arm once the sleeve is turned into place.
 */
function sleeve(meshName: string, seam: number) {
  const piece = pieceForMesh(meshName);
  const k = SLEEVE_DEPTH_RATIO;
  return buildSurface({
    piece,
    nu: 32,
    nv: 8,
    sample: (s, t) => {
      const y = t * piece.height;
      const [xl, xr] = rowSpan(piece, y);
      const r = ((xr - xl) * MM) / ellipsePerimeterFactor(k);
      const theta = angleAtArcFraction(s, k, seam, 2 * Math.PI);
      return {
        position: [r * Math.sin(theta), -y * MM, k * r * Math.cos(theta)],
        piecePoint: { x: xl + s * (xr - xl), y },
      };
    },
    axis: (t) => [0, -t * piece.height * MM, 0],
  });
}

const COLLAR_DEPTH_RATIO = TORSO_DEPTH_RATIO[0]![1];
/** A band round the neck, sitting on top of the torso; its length is the collar piece's width. */
function collar(meshName: string, torsoTop: number) {
  const piece = pieceForMesh(meshName);
  const k = COLLAR_DEPTH_RATIO;
  return buildSurface({
    piece,
    nu: 48,
    nv: 1,
    sample: (s, t) => {
      const y = t * piece.height;
      const [xl, xr] = rowSpan(piece, y);
      // A little wider than the neck it covers, so the two never fight for the same pixels.
      const r = (1.02 * (xr - xl) * MM) / ellipsePerimeterFactor(k);
      const theta = angleAtArcFraction(s, k, Math.PI, 2 * Math.PI);
      return {
        position: [r * Math.sin(theta), torsoTop + (piece.height - y) * MM, k * r * Math.cos(theta)],
        piecePoint: { x: xl + s * (xr - xl), y },
      };
    },
    axis: (t) => [0, torsoTop + (piece.height - t * piece.height) * MM, 0],
  });
}

const doc = new Document();
doc.getRoot().getAsset().copyright =
  "Generated by packages/editor/scripts/generate-placeholder-jersey.ts. No third-party content.";
const buffer = doc.createBuffer();

// One plain white material. The colours come from the pattern texture that the
// editor draws from the design at run time; the model file holds no colours.
const garment: Material = doc
  .createMaterial("garment")
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.85)
  .setDoubleSided(true);

function makeMesh(name: string, geometry: ReturnType<typeof buildSurface>) {
  const accessor = (type: "VEC2" | "VEC3" | "SCALAR", array: Float32Array | Uint16Array, semantic: string) =>
    doc.createAccessor(`${name}_${semantic}`).setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", geometry.positions, "position"))
    .setAttribute("NORMAL", accessor("VEC3", geometry.normals, "normal"))
    .setAttribute("TEXCOORD_0", accessor("VEC2", geometry.uvs, "uv"))
    .setIndices(accessor("SCALAR", geometry.indices, "indices"))
    .setMaterial(garment);
  return doc.createMesh(name).addPrimitive(prim);
}

const scene = doc.createScene("placeholder-jersey");
const jersey = doc.createNode("placeholder-jersey");
scene.addChild(jersey);

const addNode = (name: string, geometry: ReturnType<typeof buildSurface>, translation: Vec3, zRotationDeg = 0): Node => {
  const half = (zRotationDeg * Math.PI) / 360;
  const node = doc
    .createNode(name)
    .setMesh(makeMesh(name, geometry))
    .setTranslation(translation)
    .setRotation([0, 0, Math.sin(half), Math.cos(half)]);
  jersey.addChild(node);
  return node;
};

const front = pieceForMesh("front");
const torsoTop = front.height * MM;
addNode("front", torsoHalf("front", "front"), [0, 0, 0]);
addNode("back", torsoHalf("back", "back"), [0, 0, 0]);

// Sleeves hang from the shoulders, a little inside the torso's side so no gap shows.
const SLEEVE_ROOT_MM = 95;
const shoulder = torsoRadius(front, SLEEVE_ROOT_MM).rx - 0.045;
const shoulderY = torsoTop - SLEEVE_ROOT_MM * MM;
// Turned 62 degrees about Z, the underside of the left sleeve is its local -X and of the right sleeve its local +X.
addNode("sleeve_left", sleeve("sleeve_left", -Math.PI / 2), [shoulder, shoulderY, 0], 62);
addNode("sleeve_right", sleeve("sleeve_right", Math.PI / 2), [-shoulder, shoulderY, 0], -62);
addNode("collar", collar("collar", torsoTop), [0, 0, 0]);

mkdirSync(dirname(outPath), { recursive: true });
await new NodeIO().write(outPath, doc);
console.log(`Wrote ${outPath}`);
