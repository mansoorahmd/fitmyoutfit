import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearModelCache, loadModel, progressFraction, type FetchLike, type ModelLoadProgress } from "./model-loader";
import { extractGarmentMeshes } from "./garment-geometry";
import { garmentRows, renderGarmentView } from "../texture/garment-view";
import { loadStandInJerseyProduct } from "../test/fixtures";
import { loadGarmentMeshes } from "../test/garment-meshes";

const bytes = new Uint8Array(readFileSync(resolve(import.meta.dirname, "../../samples/models/stand-in-jersey.glb")));

/** A fetch that serves the jersey in 8 chunks, with or without a Content-Length. */
function fakeFetch(options: { length?: boolean; status?: number } = {}): FetchLike & { calls: number } {
  const f = (async () => {
    f.calls++;
    const chunk = Math.ceil(bytes.length / 8);
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(at, at + chunk));
        at += chunk;
      },
    });
    const headers = new Headers(options.length === false ? {} : { "content-length": String(bytes.length) });
    return { ok: (options.status ?? 200) < 400, status: options.status ?? 200, headers, body, arrayBuffer: async () => bytes.buffer };
  }) as unknown as FetchLike & { calls: number };
  f.calls = 0;
  return f;
}

afterEach(() => clearModelCache());

describe("loading the model (N17)", () => {
  it("reports the download's progress, then 1 once parsed, and loads once per URL", async () => {
    const seen: ModelLoadProgress[] = [];
    const fetch = fakeFetch();
    const first = loadModel("/models/jersey.glb", { fetch, onProgress: (p) => seen.push(p) });
    const second = loadModel("/models/jersey.glb", { fetch });
    const model = await first.promise;
    expect(await second.promise).toBe(model);
    expect(fetch.calls).toBe(1);
    const fractions = seen.map((p) => p.fraction);
    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBe(1);
    // Rising, and below 1 until parsed.
    for (let k = 1; k < fractions.length; k++) expect(fractions[k]!).toBeGreaterThanOrEqual(fractions[k - 1]!);
    expect(fractions.slice(0, -1).every((f) => f! < 1)).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(9);
    // A late subscriber gets the progress so far at once.
    const late: ModelLoadProgress[] = [];
    loadModel("/models/jersey.glb", { fetch, onProgress: (p) => late.push(p) });
    expect(late).toEqual([{ loaded: bytes.length, total: bytes.length, fraction: 1 }]);
  });

  it("without a Content-Length: no fraction until the end", async () => {
    const seen: ModelLoadProgress[] = [];
    await loadModel("/a.glb", { fetch: fakeFetch({ length: false }), onProgress: (p) => seen.push(p) }).promise;
    expect(seen.slice(0, -1).every((p) => p.fraction === null && p.total === null)).toBe(true);
    expect(seen.at(-1)!.fraction).toBe(1);
  });

  it("a failed load is forgotten, so trying again loads afresh", async () => {
    const bad = fakeFetch({ status: 503 });
    await expect(loadModel("/b.glb", { fetch: bad }).promise).rejects.toThrow(/HTTP 503/);
    const good = fakeFetch();
    await expect(loadModel("/b.glb", { fetch: good }).promise).resolves.toBeTruthy();
    expect(good.calls).toBe(1);
  });

  it("progress fractions are clamped below 1 and unknown without a total", () => {
    expect(progressFraction(50, 100)).toBe(0.5);
    expect(progressFraction(120, 100)).toBe(0.99);
    expect(progressFraction(10, null)).toBeNull();
    expect(progressFraction(10, 0)).toBeNull();
  });
});

describe("the garment's meshes from the loaded model", () => {
  it("give the same view as the meshes read from the file (positions, UVs, normals, occlusion)", async () => {
    const { scene } = await loadModel("/models/jersey.glb", { fetch: fakeFetch() }).promise;
    const meshes = extractGarmentMeshes(scene, loadStandInJerseyProduct());
    expect(meshes.length).toBe(1);
    expect(meshes[0]!.occlusion).not.toBeNull();
    const a = renderGarmentView(meshes, { width: 60, height: 75, supersample: 1 });
    const b = renderGarmentView(loadGarmentMeshes("stand-in-jersey.glb"), { width: 60, height: 75, supersample: 1 });
    expect(garmentRows(a)).toEqual(garmentRows(b));
    let differ = 0;
    for (let k = 0; k < a.u.length; k++) if (Math.abs(a.u[k]! - b.u[k]!) > 1e-3 || Math.abs(a.light[k]! - b.light[k]!) > 0.02) differ++;
    expect(differ / a.u.length).toBeLessThan(0.01);
  });
});
