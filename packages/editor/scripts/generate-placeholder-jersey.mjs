// Generates the PLACEHOLDER jersey model: samples/models/placeholder-jersey.glb
//
// Origin and licence: this model is created entirely by this script
// (procedural geometry, written with @gltf-transform/core). No third-party
// model, texture or file is used or downloaded, so there is nothing to
// attribute. It carries the same licence as the rest of this repository.
//
// It is a stand-in for the real garment models. The mesh names, material names
// and UV rectangles it produces are read from
// samples/products/placeholder-jersey.json, so the model and the product
// definition cannot drift apart. A real model replaces this file and the
// product definition JSON; no code changes are needed.
//
// Conventions: metres, +Y up, the wearer faces +Z. The wearer's left is +X.
// UVs follow glTF: origin top-left, V grows downwards. Piece coordinates
// (millimetres, origin top-left, Y down) map linearly onto each piece's
// UV rectangle.
//
// Usage: npm run generate:model

import { Document, NodeIO } from "@gltf-transform/core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productPath = resolve(root, "samples/products/placeholder-jersey.json");
const outPath = resolve(root, "samples/models/placeholder-jersey.glb");

const product = JSON.parse(readFileSync(productPath, "utf8"));

function pieceUv(meshName) {
  const piece = product.pieces.find((p) => p.mesh === meshName);
  if (!piece) throw new Error(`Product definition has no piece for mesh "${meshName}"`);
  return piece.uv;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Builds a (nu+1) x (nv+1) grid surface.
 * point(s, t): s runs left to right across the piece, t runs top to bottom,
 * both 0..1. axis(t): a point inside the surface, used to orient normals out.
 */
function buildSurface({ point, axis, nu, nv, uv }) {
  const eps = 1e-3;
  const positions = [];
  const normals = [];
  const uvs = [];
  const cols = nu + 1;
  for (let i = 0; i <= nv; i++) {
    const t = i / nv;
    for (let j = 0; j <= nu; j++) {
      const s = j / nu;
      const p = point(s, t);
      const dpds = sub(point(s + eps, t), point(s - eps, t));
      const dpdt = sub(point(s, clamp01(t + eps)), point(s, clamp01(t - eps)));
      let n = norm(cross(dpds, dpdt));
      if (dot(n, sub(p, axis(t))) < 0) n = [-n[0], -n[1], -n[2]];
      positions.push(...p);
      normals.push(...n);
      uvs.push(uv.x + s * uv.width, uv.y + t * uv.height);
    }
  }
  const indices = [];
  const pushTri = (a, b, c) => {
    const pa = positions.slice(a * 3, a * 3 + 3);
    const pb = positions.slice(b * 3, b * 3 + 3);
    const pc = positions.slice(c * 3, c * 3 + 3);
    const geo = cross(sub(pb, pa), sub(pc, pa));
    const na = normals.slice(a * 3, a * 3 + 3);
    if (dot(geo, na) >= 0) indices.push(a, b, c);
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

// Torso outline: [height y, half-width rx, half-depth rz], bottom hem to neck.
const TORSO_HEIGHT = 0.7;
const TORSO_PROFILE = [
  [0.0, 0.23, 0.12],
  [0.45, 0.22, 0.115],
  [0.58, 0.21, 0.11],
  [0.66, 0.12, 0.08],
  [0.7, 0.085, 0.065],
];
function torsoAt(t) {
  const y = TORSO_HEIGHT * (1 - t);
  for (let k = 0; k < TORSO_PROFILE.length - 1; k++) {
    const a = TORSO_PROFILE[k];
    const b = TORSO_PROFILE[k + 1];
    if (y <= b[0] + 1e-9) {
      const f = (y - a[0]) / (b[0] - a[0]);
      return { y, rx: a[1] + f * (b[1] - a[1]), rz: a[2] + f * (b[2] - a[2]) };
    }
  }
  const last = TORSO_PROFILE[TORSO_PROFILE.length - 1];
  return { y, rx: last[1], rz: last[2] };
}

// Half a torso, seen from the front (theta 0 faces +Z) or from the back.
function torsoHalf(meshName, startTheta) {
  return buildSurface({
    nu: 24,
    nv: 32,
    uv: pieceUv(meshName),
    point: (s, t) => {
      const { y, rx, rz } = torsoAt(clamp01(t));
      const theta = startTheta + s * Math.PI;
      return [rx * Math.sin(theta), y, rz * Math.cos(theta)];
    },
    axis: (t) => [0, torsoAt(clamp01(t)).y, 0],
  });
}

const SLEEVE_LENGTH = 0.22;
function sleeve(meshName) {
  const radius = (t) => 0.075 - 0.008 * t;
  return buildSurface({
    nu: 20,
    nv: 6,
    uv: pieceUv(meshName),
    point: (s, t) => {
      const theta = s * 2 * Math.PI;
      return [radius(t) * Math.cos(theta), -SLEEVE_LENGTH * t, 0.9 * radius(t) * Math.sin(theta)];
    },
    axis: (t) => [0, -SLEEVE_LENGTH * t, 0],
  });
}

function collar(meshName) {
  return buildSurface({
    nu: 24,
    nv: 1,
    uv: pieceUv(meshName),
    point: (s, t) => {
      const theta = s * 2 * Math.PI;
      const y = 0.73 - 0.03 * t;
      return [0.088 * Math.sin(theta), y, 0.068 * Math.cos(theta)];
    },
    axis: (t) => [0, 0.73 - 0.03 * clamp01(t), 0],
  });
}

const doc = new Document();
doc.getRoot().getAsset().copyright = "Generated by packages/editor/scripts/generate-placeholder-jersey.mjs. No third-party content.";
const buffer = doc.createBuffer();

const materialColours = {
  body: [0.8, 0.8, 0.8, 1],
  sleeves: [0.7, 0.7, 0.7, 1],
  collar: [0.55, 0.55, 0.55, 1],
};
const materials = {};
for (const zone of product.zones) {
  for (const name of zone.materials) {
    materials[name] = doc
      .createMaterial(name)
      .setBaseColorFactor(materialColours[name] ?? [0.8, 0.8, 0.8, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.85)
      .setDoubleSided(true);
  }
}

function makeMesh(name, geometry, materialName) {
  const material = materials[materialName];
  if (!material) throw new Error(`Product definition has no zone material "${materialName}"`);
  const accessor = (type, array, semantic) =>
    doc.createAccessor(`${name}_${semantic}`).setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", geometry.positions, "position"))
    .setAttribute("NORMAL", accessor("VEC3", geometry.normals, "normal"))
    .setAttribute("TEXCOORD_0", accessor("VEC2", geometry.uvs, "uv"))
    .setIndices(accessor("SCALAR", geometry.indices, "indices"))
    .setMaterial(material);
  return doc.createMesh(name).addPrimitive(prim);
}

const scene = doc.createScene("placeholder-jersey");
const jersey = doc.createNode("placeholder-jersey");
scene.addChild(jersey);

const addNode = (name, mesh, translation, zRotationDeg = 0) => {
  const node = doc.createNode(name).setMesh(mesh).setTranslation(translation);
  const half = (zRotationDeg * Math.PI) / 360;
  node.setRotation([0, 0, Math.sin(half), Math.cos(half)]);
  jersey.addChild(node);
};

addNode("front", makeMesh("front", torsoHalf("front", -Math.PI / 2), "body"), [0, 0, 0]);
addNode("back", makeMesh("back", torsoHalf("back", Math.PI / 2), "body"), [0, 0, 0]);
addNode("sleeve_left", makeMesh("sleeve_left", sleeve("sleeve_left"), "sleeves"), [0.17, 0.625, 0], 65);
addNode("sleeve_right", makeMesh("sleeve_right", sleeve("sleeve_right"), "sleeves"), [-0.17, 0.625, 0], -65);
addNode("collar", makeMesh("collar", collar("collar"), "collar"), [0, 0, 0]);

mkdirSync(dirname(outPath), { recursive: true });
await new NodeIO().write(outPath, doc);
console.log(`Wrote ${outPath}`);
