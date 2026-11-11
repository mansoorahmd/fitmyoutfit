/**
 * A minimal, strict reader for binary glTF (GLB) files: the JSON chunk, the
 * binary chunk, accessors as numbers, and node world matrices. Only what the
 * model processing needs. The file is treated as untrusted data: every offset
 * and length is checked against the buffer before it is read, and nothing in
 * the file is executed or fetched (external URIs are refused).
 */

export interface GltfJson {
  asset?: { version?: string; generator?: string; copyright?: string };
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{ name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }>;
  meshes?: Array<{ name?: string; primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number; material?: number }> }>;
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  [key: string]: unknown;
}

export interface Glb {
  json: GltfJson;
  bin: Uint8Array;
}

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Splits a GLB into its JSON and binary chunks. Throws a `RangeError` for anything malformed. */
export function readGlb(bytes: Uint8Array): Glb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20) throw new RangeError("not a GLB file: too short");
  if (view.getUint32(0, true) !== MAGIC) throw new RangeError("not a GLB file: wrong magic number");
  if (view.getUint32(4, true) !== 2) throw new RangeError(`unsupported GLB version ${view.getUint32(4, true)}`);
  const length = view.getUint32(8, true);
  if (length > bytes.byteLength) throw new RangeError("the GLB header claims more bytes than the file has");
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array = new Uint8Array(0);
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + chunkLength > length) throw new RangeError("a GLB chunk runs past the end of the file");
    const data = bytes.subarray(start, start + chunkLength);
    if (type === CHUNK_JSON && json === null) json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as GltfJson;
    else if (type === CHUNK_BIN && bin.byteLength === 0) bin = data;
    offset = start + chunkLength;
  }
  if (!json || typeof json !== "object") throw new RangeError("the GLB has no JSON chunk");
  for (const buffer of json.buffers ?? []) {
    // Inline (data:) buffers are allowed, as CLO puts its images there; they are never decoded,
    // since accessors may only use the binary chunk (buffer 0). Nothing is ever fetched.
    if (buffer.uri !== undefined && !buffer.uri.startsWith("data:")) {
      throw new RangeError("the GLB refers to an external file; only self-contained files are read");
    }
  }
  return { json, bin };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** An accessor's values as plain numbers (normalized integers scaled to 0..1 or -1..1), with the number per element. */
export function readAccessor(glb: Glb, index: number): { values: Float64Array; size: number; count: number } {
  const accessor = glb.json.accessors?.[index];
  if (!accessor) throw new RangeError(`no accessor ${index}`);
  const size = COMPONENTS[accessor.type];
  const bytes = BYTES[accessor.componentType];
  if (!size || !bytes) throw new RangeError(`accessor ${index} has an unsupported type ${accessor.type} / ${accessor.componentType}`);
  if (!Number.isInteger(accessor.count) || accessor.count < 0) throw new RangeError(`accessor ${index} has an invalid count`);
  const values = new Float64Array(accessor.count * size);
  if (accessor.bufferView === undefined) return { values, size, count: accessor.count }; // all zeros, per the spec
  const viewDef = glb.json.bufferViews?.[accessor.bufferView];
  if (!viewDef || viewDef.buffer !== 0) throw new RangeError(`accessor ${index} uses a missing or external buffer view`);
  const stride = viewDef.byteStride ?? size * bytes;
  const base = (viewDef.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = (viewDef.byteOffset ?? 0) + viewDef.byteLength;
  const last = accessor.count === 0 ? base : base + (accessor.count - 1) * stride + size * bytes;
  if (last > end || end > glb.bin.byteLength) throw new RangeError(`accessor ${index} runs past its buffer view`);
  const dv = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const normalized = accessor.normalized === true;
  for (let i = 0; i < accessor.count; i++) {
    for (let k = 0; k < size; k++) {
      const o = base + i * stride + k * bytes;
      let v: number;
      switch (accessor.componentType) {
        case 5120:
          v = dv.getInt8(o);
          if (normalized) v = Math.max(v / 127, -1);
          break;
        case 5121:
          v = dv.getUint8(o);
          if (normalized) v /= 255;
          break;
        case 5122:
          v = dv.getInt16(o, true);
          if (normalized) v = Math.max(v / 32767, -1);
          break;
        case 5123:
          v = dv.getUint16(o, true);
          if (normalized) v /= 65535;
          break;
        case 5125:
          v = dv.getUint32(o, true);
          break;
        default:
          v = dv.getFloat32(o, true);
      }
      values[i * size + k] = v;
    }
  }
  return { values, size, count: accessor.count };
}

/** 4x4 column-major matrix product a * b. */
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

/** A node's local matrix (column-major), from `matrix` or from translation, rotation and scale. */
export function localMatrix(node: NonNullable<GltfJson["nodes"]>[number]): number[] {
  if (node.matrix) return [...node.matrix];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [qx, qy, qz, qw] = [x!, y!, z!, w!];
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx!, 2 * (qx * qy + qz * qw) * sx!, 2 * (qx * qz - qy * qw) * sx!, 0,
    2 * (qx * qy - qz * qw) * sy!, (1 - 2 * (qx * qx + qz * qz)) * sy!, 2 * (qy * qz + qx * qw) * sy!, 0,
    2 * (qx * qz + qy * qw) * sz!, 2 * (qy * qz - qx * qw) * sz!, (1 - 2 * (qx * qx + qy * qy)) * sz!, 0,
    tx!, ty!, tz!, 1,
  ];
}

/** Every node's world matrix (column-major), by node index, walking down from the default scene. */
export function worldMatrices(json: GltfJson): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const nodes = json.nodes ?? [];
  const visit = (index: number, parent: number[], depth: number) => {
    if (depth > 64 || out.has(index)) throw new RangeError("the node hierarchy is too deep or has a cycle");
    const node = nodes[index];
    if (!node) throw new RangeError(`no node ${index}`);
    const world = multiply(parent, localMatrix(node));
    out.set(index, world);
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of json.scenes?.[json.scene ?? 0]?.nodes ?? []) visit(root, identity, 0);
  return out;
}
