import { describe, expect, it, vi } from "vitest";
import {
  DeviceDesignStore,
  createAutosave,
  createDeviceAssetStore,
  createMemoryKeyValueStore,
  designAssetIds,
  openIndexedDbStore,
  type SaveState,
} from "./device-store";
import { createDesign } from "../design/create";
import { addLayer, setZoneColor } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
import type { DesignDocument } from "../design/schema";
import { FakeIndexedDb } from "../test/fake-indexeddb";
import { loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const product = loadStandInJerseyProduct();
const RED = { id: "placeholder-red", hex: "#C8102E" };

function withLogo(assetId: string): DesignDocument {
  return addLayer(createDesign(product), newLogoLayer(product, { id: "crest", preset: "left-chest", asset: { assetId, mediaType: "image/png", width: 600, height: 600 } }), { product });
}

describe("the IndexedDB store (openIndexedDbStore)", () => {
  it("creates its two stores once, then gets, puts, deletes and lists keys", async () => {
    const idb = new FakeIndexedDb();
    const kv = await openIndexedDbStore("test", idb);
    expect([...idb.databases.get("test")!.keys()].sort()).toEqual(["assets", "designs"]);
    await kv.put("designs", "a", { x: 1 });
    expect(await kv.get("designs", "a")).toEqual({ x: 1 });
    expect(await kv.keys("designs")).toEqual(["a"]);
    await kv.delete("designs", "a");
    expect(await kv.get("designs", "a")).toBeUndefined();
    // Opening again keeps the data.
    await kv.put("assets", "b", 2);
    const again = await openIndexedDbStore("test", idb);
    expect(await again.get("assets", "b")).toBe(2);
  });

  it("rejects when the browser refuses, and a write fails when the disk is full", async () => {
    const idb = new FakeIndexedDb();
    idb.refuseOpen = true;
    await expect(openIndexedDbStore("x", idb)).rejects.toThrow(/refused/);
    await expect(openIndexedDbStore("x", undefined)).rejects.toThrow(/no IndexedDB/);
    const ok = new FakeIndexedDb();
    const kv = await openIndexedDbStore("y", ok);
    ok.failWrites = true;
    await expect(kv.put("designs", "k", 1)).rejects.toThrow(/quota/);
  });
});

describe("the last design on this device", () => {
  it("saves and brings back the design, validated against the product", async () => {
    const store = new DeviceDesignStore(createMemoryKeyValueStore());
    expect(await store.loadDesign(product)).toBeNull();
    const design = setZoneColor(createDesign(product, { teamName: "LIONS" }), "sleeves", RED);
    await store.saveDesign(product.id, design, { now: 1234, started: true });
    const back = await store.loadDesign(product);
    expect(back).toMatchObject({ savedAt: 1234, started: true, productId: product.id });
    expect(back!.design).toEqual(design);
    // Another product's editor does not offer it.
    expect(await store.loadDesign(loadStandInProduct())).toBeNull();
  });

  it("ignores a saved design that no longer fits (broken, or for an older product)", async () => {
    const kv = createMemoryKeyValueStore();
    const store = new DeviceDesignStore(kv);
    await kv.put("designs", `last:${product.id}`, { version: 1, productId: product.id, savedAt: 1, design: { schemaVersion: 3, nonsense: true } });
    expect(await store.loadDesign(product)).toBeNull();
    await kv.put("designs", `last:${product.id}`, { version: 99, productId: product.id, design: createDesign(product) });
    expect(await store.loadDesign(product)).toBeNull();
  });

  it("keeps logo files: upload stores them, restore reads them back, start again removes unused ones", async () => {
    const kv = createMemoryKeyValueStore();
    const store = new DeviceDesignStore(kv);
    let n = 0;
    const assets = createDeviceAssetStore(store, { createUrl: () => `blob:${++n}`, revokeUrl: () => undefined });
    const { assetId } = await assets.upload({ bytes: new Uint8Array([137, 80, 78, 71]), mediaType: "image/png", width: 600, height: 600, fileName: "crest.png" });
    expect(assets.url({ assetId })).toBe("blob:1");
    expect(assets.fileName(assetId)).toBe("crest.png");
    await store.saveDesign(product.id, withLogo(assetId));
    // A new page: a fresh asset store reads the file back.
    const later = createDeviceAssetStore(store, { createUrl: () => "blob:later", revokeUrl: () => undefined });
    expect(later.url({ assetId })).toBeNull();
    const saved = await store.loadDesign(product);
    expect(await later.restore(designAssetIds(saved!.design))).toEqual([]);
    expect(later.url({ assetId })).toBe("blob:later");
    expect(later.fileName(assetId)).toBe("crest.png");
    expect(await later.restore(["gone"])).toEqual(["gone"]);
    // Start again: the design and its now unused file go.
    await store.clearDesign(product.id);
    expect(await store.loadDesign(product)).toBeNull();
    expect(await kv.keys("assets")).toEqual([]);
  });
});

describe("autosave", () => {
  function manualTimers() {
    const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
    return {
      setTimer: (fn: () => void, ms: number) => {
        const t = { fn, ms, live: true };
        timers.push(t);
        return t;
      },
      clearTimer: (t: unknown) => {
        (t as { live: boolean }).live = false;
      },
      fire: () => timers.filter((t) => t.live).forEach((t) => ((t.live = false), t.fn())),
      live: () => timers.filter((t) => t.live).length,
    };
  }

  it("saves once, 1 s after the last change, and says Saving then Saved", async () => {
    const saved: DesignDocument[] = [];
    const states: SaveState[] = [];
    const timers = manualTimers();
    const auto = createAutosave({ save: async (d) => void saved.push(d), onState: (s) => states.push(s), ...timers });
    const a = createDesign(product, { teamName: "A" });
    const b = createDesign(product, { teamName: "B" });
    auto.schedule(a);
    auto.schedule(b);
    expect(timers.live()).toBe(1);
    expect(states).toEqual(["saving"]);
    timers.fire();
    await vi.waitFor(() => expect(states).toEqual(["saving", "saved"]));
    expect(saved).toEqual([b]);
    expect(auto.state).toBe("saved");
  });

  it("flush saves at once (Done, leaving); a failed save says Not saved", async () => {
    const states: SaveState[] = [];
    const timers = manualTimers();
    let fail = false;
    const auto = createAutosave({ save: async () => { if (fail) throw new Error("quota"); }, onState: (s) => states.push(s), ...timers });
    auto.schedule(createDesign(product));
    await auto.flush();
    expect(timers.live()).toBe(0);
    expect(states.at(-1)).toBe("saved");
    fail = true;
    auto.schedule(createDesign(product, { teamName: "X" }));
    await expect(auto.flush()).rejects.toThrow(/quota/);
    expect(auto.state).toBe("failed");
    // Nothing waiting: flush resolves.
    fail = false;
    auto.schedule(createDesign(product, { teamName: "Y" }));
    await auto.flush();
    expect(auto.state).toBe("saved");
    await expect(auto.flush()).resolves.toBeUndefined();
  });
});
