/**
 * G3: makes the body model that stands under a garment (samples/models/body-male.glb) from the Style3D avatar, driven
 * by its source record (samples/models/body-male.source.json, picked by the source file's SHA-256, as the garments'
 * route does):
 *
 *   npm run process:body -- <path to avatar.glb>
 *
 * The avatar is a static (not skinned) man in A-pose: shoes, hair, body, face, eyes and so on, several materials
 * sharing vertex buffers. The script keeps what the picture needs, drops what a phone cannot see (the record's
 * `dropMaterials`), drops every texture but the base colour (the normal and metal maps), makes plain PBR materials
 * (hair and scalp cut out, not blended, so they sort with the cloth), changes no shape and keeps the avatar's frame,
 * so the body lines up under garments simulated on it. The vertex data is stored as integers (KHR_mesh_quantization,
 * one frame for every mesh). The same input gives the same file byte for byte. A development stand-in: see
 * samples/models/body-male.LICENSE.txt.
 */
import { Document, NodeIO } from "@gltf-transform/core";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type BodyRecord, compactPrimitive, packUvs } from "./model-prep/body.js";
import { readAccessor, readGlb, worldMatrices, worldPositions } from "./model-prep/glb.js";
import { KHRMeshQuantization, quantizationFrame, quantizeNormals, quantizePositions } from "./model-prep/quantize.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = resolve(root, "samples/models");

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Usage: npm run process:body -- <path to the avatar .glb named in samples/models/body-*.source.json>");
  process.exit(2);
}
const bytes = readFileSync(sourcePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const found = readdirSync(modelsDir)
  .filter((f) => /^body-.*\.source\.json$/.test(f))
  .map((f) => ({ path: resolve(modelsDir, f), record: JSON.parse(readFileSync(resolve(modelsDir, f), "utf8")) as BodyRecord }))
  .find((r) => r.record.source.sha256 === sha256);
if (!found) throw new Error(`The source file's SHA-256 is ${sha256}, which no body record in ${modelsDir} names.`);
const record = found.record;
console.log(`Source: ${sourcePath} (${bytes.length} bytes, SHA-256 ${sha256})\nRecord: ${found.path}`);

const glb = readGlb(new Uint8Array(bytes));
interface Json {
  materials?: Array<{ name: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }>;
  textures?: Array<{ source: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
  nodes?: Array<{ mesh?: number }>;
  meshes?: Array<{ name: string; primitives: Array<{ material: number; indices: number; attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number } }> }>;
}
const json = glb.json as Json;
const world = worldMatrices(glb.json);

const imageOf = (material: NonNullable<Json["materials"]>[number]): { bytes: Uint8Array; mime: string } | null => {
  const tex = material.pbrMetallicRoughness?.baseColorTexture?.index;
  const source = tex === undefined ? undefined : json.textures?.[tex]?.source;
  const im = source === undefined ? undefined : json.images?.[source];
  if (!im || im.bufferView === undefined) return null;
  const bv = json.bufferViews![im.bufferView]!;
  const start = bv.byteOffset ?? 0;
  return { bytes: glb.bin.slice(start, start + bv.byteLength), mime: im.mimeType ?? "image/jpeg" };
};

interface Part {
  name: string;
  material: string;
  positions: Float64Array;
  normals: Float64Array;
  uvs: Float64Array;
  indices: Uint32Array;
}
const parts: Part[] = [];
(json.nodes ?? []).forEach((node, index) => {
  if (node.mesh === undefined) return;
  const mesh = json.meshes![node.mesh]!;
  const matrix = world.get(index);
  if (!matrix) return;
  for (const prim of mesh.primitives) {
    const materialName: string = json.materials![prim.material]!.name;
    if (record.dropMaterials.includes(materialName)) continue;
    const position = readAccessor(glb, prim.attributes.POSITION);
    const normal = readAccessor(glb, prim.attributes.NORMAL);
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);
    const indices = readAccessor(glb, prim.indices);
    const compact = compactPrimitive(worldPositions(position.values, matrix), normal.values, uv.values, indices.values);
    if (compact.positions.length / 3 > 65535) throw new Error(`${materialName} has more than 65535 vertices`);
    parts.push({ name: `${mesh.name}_${materialName}`.replace(/\s+/g, "_"), material: materialName, ...compact });
  }
});

const doc = new Document();
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc.getRoot().getAsset().copyright = record.output.copyright;
doc.getRoot().getAsset().generator = record.output.generator;
const buffer = doc.createBuffer();
const frame = quantizationFrame(parts.map((p) => p.positions));
const scene = doc.createScene("body");
const body = doc.createNode("body").setScale([frame.scale, frame.scale, frame.scale]).setTranslation(frame.translation);
scene.addChild(body);
const made = new Map<string, ReturnType<Document["createMaterial"]>>();
for (const part of parts) {
  let material = made.get(part.material);
  if (!material) {
    const src = json.materials!.find((m) => m.name === part.material)!;
    material = doc.createMaterial(part.material).setMetallicFactor(0).setRoughnessFactor(record.roughness[part.material] ?? 0.7).setDoubleSided(false);
    if (record.cutoutMaterials.includes(part.material)) material.setAlphaMode("MASK").setAlphaCutoff(0.5).setDoubleSided(true);
    const image = imageOf(src);
    if (image) material.setBaseColorTexture(doc.createTexture(part.material).setImage(image.bytes).setMimeType(image.mime));
    made.set(part.material, material);
  }
  const q = quantizePositions(part.positions, frame);
  const uv = packUvs(part.uvs);
  const accessor = (name: string, type: "VEC2" | "VEC3" | "SCALAR", array: ArrayBufferView & ArrayLike<number>, normalized: boolean) =>
    doc.createAccessor(`${part.name}_${name}`).setType(type).setArray(array as never).setBuffer(buffer).setNormalized(normalized);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("position", "VEC3", q.values, true))
    .setAttribute("NORMAL", accessor("normal", "VEC3", quantizeNormals(part.normals), true))
    .setAttribute("TEXCOORD_0", accessor("uv", "VEC2", uv.array, uv.normalized))
    .setIndices(accessor("indices", "SCALAR", Uint16Array.from(part.indices), false))
    .setMaterial(material);
  body.addChild(doc.createNode(part.name).setMesh(doc.createMesh(part.name).addPrimitive(prim)));
}
const out = resolve(root, record.output.model);
await new NodeIO().registerExtensions([KHRMeshQuantization]).write(out, doc);
const triangles = parts.reduce((s, p) => s + p.indices.length / 3, 0);
console.log(`Wrote ${out}: ${statSync(out).size} bytes, ${parts.length} meshes, ${triangles} triangles`);
