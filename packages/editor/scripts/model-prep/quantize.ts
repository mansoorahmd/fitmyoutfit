/**
 * Smaller vertex data for the model file, by the glTF extension
 * KHR_mesh_quantization (supported by Three.js's GLTFLoader, no decoder
 * needed): positions as 16-bit integers with a node scale and translation
 * that turn them back into metres, normals as 8-bit integers, UVs as 16-bit
 * integers. A vertex shrinks from 36 to 20 bytes (with the occlusion pair).
 *
 * Precision: positions to 1/32767 of half the garment's largest extent
 * (about 0.01 mm), UVs to 1/65535 (0.03 texture pixels at 2048), normals
 * to about half a degree.
 *
 * glTF-Transform's core has no class for the extension (its extensions
 * package does; we add no package for it). The extension holds no data: it
 * only declares that accessors may be integers, so the small class below is
 * all it needs.
 */
import { Extension } from "@gltf-transform/core";

/** Declares KHR_mesh_quantization in a document (`doc.createExtension(KHRMeshQuantization).setRequired(true)`), and lets NodeIO read files that require it. */
export class KHRMeshQuantization extends Extension {
  static override readonly EXTENSION_NAME = "KHR_mesh_quantization";
  override readonly extensionName = "KHR_mesh_quantization";
  read(): this {
    return this;
  }
  write(): this {
    return this;
  }
}

export interface QuantizedPositions {
  /** Normalised 16-bit values: value / 32767 is the position in [-1, 1]. */
  values: Int16Array;
  /** The node's uniform scale: metres per unit of value / 32767. */
  scale: number;
  /** The node's translation: the box's centre, in metres. */
  translation: [number, number, number];
}

/** The grid positions are stored on: a uniform scale and a translation (the node's). */
export type QuantizationFrame = Pick<QuantizedPositions, "scale" | "translation">;

/**
 * The frame that holds every given set of positions: the centre of their common box, and half its longest side.
 * Several meshes quantized in ONE frame put equal points on equal integers, so a seam welded between two meshes
 * stays closed after quantization (each mesh in a frame of its own would round its seam vertices differently).
 */
export function quantizationFrame(sets: ReadonlyArray<ArrayLike<number>>): QuantizationFrame {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const positions of sets) {
    const count = Math.floor(positions.length / 3);
    for (let k = 0; k < count * 3; k++) {
      lo[k % 3] = Math.min(lo[k % 3]!, positions[k]!);
      hi[k % 3] = Math.max(hi[k % 3]!, positions[k]!);
    }
  }
  if (!Number.isFinite(lo[0]!)) throw new RangeError("no positions to quantize");
  const translation = [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2) as [number, number, number];
  const scale = Math.max(...[0, 1, 2].map((a) => (hi[a]! - lo[a]!) / 2)) || 1;
  return { scale, translation };
}

/**
 * Positions (x, y, z per vertex) as normalised 16-bit integers about the
 * box's centre, with one scale for all axes (so normals need no correction).
 * Equal inputs give equal outputs, so welded seams stay closed. `frame`: a
 * frame shared with other meshes (`quantizationFrame`); by default the
 * positions' own box. Throws when a position lies outside the frame.
 */
export function quantizePositions(positions: ArrayLike<number>, frame?: QuantizationFrame): QuantizedPositions {
  const count = Math.floor(positions.length / 3);
  if (count === 0) throw new RangeError("no positions to quantize");
  const { scale, translation } = frame ?? quantizationFrame([positions]);
  for (let k = 0; k < count * 3; k++) {
    if (Math.abs(positions[k]! - translation[k % 3]!) > scale * (1 + 1e-9)) throw new RangeError("a position lies outside the quantization frame");
  }
  const values = new Int16Array(count * 3);
  for (let k = 0; k < count * 3; k++) values[k] = Math.round(((positions[k]! - translation[k % 3]!) / scale) * 32767);
  return { values, scale, translation };
}

/** Unit vectors as normalised 8-bit integers (value / 127). */
export function quantizeNormals(normals: ArrayLike<number>): Int8Array {
  const out = new Int8Array(normals.length);
  for (let k = 0; k < normals.length; k++) out[k] = Math.max(-127, Math.min(127, Math.round(normals[k]! * 127)));
  return out;
}

/** UVs in [0, 1] as normalised unsigned 16-bit integers (value / 65535). Throws for a UV outside [0, 1]. */
export function quantizeUvs(uvs: ArrayLike<number>): Uint16Array {
  const out = new Uint16Array(uvs.length);
  for (let k = 0; k < uvs.length; k++) {
    const x = uvs[k]!;
    if (!(x >= 0 && x <= 1)) throw new RangeError(`UV value ${x} is outside 0 to 1`);
    out[k] = Math.round(x * 65535);
  }
  return out;
}
