/**
 * Loads a garment model (GLB) once per URL, with download progress (N17,
 * 06-editor.md 10.1), for the 3D view and for the template cards (which need
 * the model's geometry, not WebGL). Three.js's GLTFLoader parses it; nothing
 * needs a GPU, so the flat view (no WebGL) can load it too.
 *
 * - Progress comes from the download (bytes received of Content-Length); when
 *   the server sends no length, `fraction` is null until the end.
 * - A failed load is forgotten, so "Try again" loads afresh.
 * - Nothing runs on import (server safe).
 */
import type { Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface ModelLoadProgress {
  /** Bytes received. */
  loaded: number;
  /** Bytes expected, or null when the server did not say. */
  total: number | null;
  /** 0 to 1, or null when unknown. 1 only once the model is parsed. */
  fraction: number | null;
}

export interface LoadedModel {
  scene: Object3D;
  url: string;
}

/** The fetch to use (the browser's by default; tests pass their own). */
export type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "headers" | "body" | "arrayBuffer">>;

interface Entry {
  promise: Promise<LoadedModel>;
  listeners: Set<(progress: ModelLoadProgress) => void>;
  last: ModelLoadProgress | null;
}

const entries = new Map<string, Entry>();

/** Progress as a fraction: received over expected, never 1 before the model is parsed. */
export function progressFraction(loaded: number, total: number | null): number | null {
  if (total === null || !(total > 0)) return null;
  return Math.min(0.99, Math.max(0, loaded / total));
}

async function download(url: string, fetchImpl: FetchLike, report: (p: ModelLoadProgress) => void): Promise<ArrayBuffer> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`the model could not be loaded (HTTP ${response.status})`);
  const header = Number(response.headers.get("content-length"));
  const total = Number.isFinite(header) && header > 0 ? header : null;
  report({ loaded: 0, total, fraction: progressFraction(0, total) });
  const body = response.body;
  if (!body || typeof body.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    report({ loaded: buffer.byteLength, total, fraction: progressFraction(buffer.byteLength, total) });
    return buffer;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    report({ loaded, total, fraction: progressFraction(loaded, total) });
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out.buffer;
}

/**
 * Loads (or reuses) the model at `url`. `onProgress` is called with the
 * progress so far, then on every chunk. Returns the promise and a function
 * that stops the progress calls (the load itself goes on for other users).
 */
export function loadModel(
  url: string,
  options: { onProgress?: (progress: ModelLoadProgress) => void; fetch?: FetchLike } = {},
): { promise: Promise<LoadedModel>; unsubscribe: () => void } {
  let entry = entries.get(url);
  if (!entry) {
    const listeners = new Set<(progress: ModelLoadProgress) => void>();
    const created: Entry = { promise: Promise.resolve(null as unknown as LoadedModel), listeners, last: null };
    const report = (p: ModelLoadProgress) => {
      created.last = p;
      for (const listener of listeners) listener(p);
    };
    const fetchImpl: FetchLike = options.fetch ?? ((u) => fetch(u));
    created.promise = download(url, fetchImpl, report)
      .then((buffer) => new GLTFLoader().parseAsync(buffer, ""))
      .then((gltf) => {
        const last = created.last;
        report({ loaded: last?.loaded ?? 0, total: last?.total ?? null, fraction: 1 });
        return { scene: gltf.scene, url };
      })
      .catch((error: unknown) => {
        entries.delete(url);
        throw error instanceof Error ? error : new Error(String(error));
      });
    entries.set(url, created);
    entry = created;
  }
  const current = entry;
  const listener = options.onProgress;
  if (listener) {
    current.listeners.add(listener);
    if (current.last) listener(current.last);
  }
  return { promise: current.promise, unsubscribe: () => listener && current.listeners.delete(listener) };
}

/** Forgets every loaded model (tests). */
export function clearModelCache(): void {
  entries.clear();
}
