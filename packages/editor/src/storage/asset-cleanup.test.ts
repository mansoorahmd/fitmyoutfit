/**
 * Logo files on the device (E3c): a file no design state in the history refers
 * to is let go (S7); a restored design's unused files are deleted (S7); the
 * "prints as a box" finding is kept with the file (S3); a missing file is a
 * check on the item (S2). With the in-memory store.
 */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer, removeLayer } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
import type { DesignDocument } from "../design/schema";
import { loadStandInJerseyProduct } from "../test/fixtures";
import { designChecks, itemChecks } from "../ui/checks";
import { EDITOR_WORDING as W } from "../ui/content";
import { DeviceDesignStore, assetsNoLongerUsed, createDeviceAssetStore, createMemoryKeyValueStore, designAssetIds } from "./device-store";

const product = loadStandInJerseyProduct();
const png = { bytes: new Uint8Array([137, 80, 78, 71]), mediaType: "image/png" as const, width: 600, height: 600 };
const withLogo = (d: DesignDocument, assetId: string, id = "logo-1") =>
  addLayer(d, newLogoLayer(product, { id, preset: "left-chest", asset: { assetId, mediaType: "image/png", width: 600, height: 600 } }), { product });

function setup() {
  const kv = createMemoryKeyValueStore();
  const store = new DeviceDesignStore(kv);
  const revoked: string[] = [];
  let n = 0;
  const assets = createDeviceAssetStore(store, { createUrl: () => `blob:${++n}`, revokeUrl: (u) => void revoked.push(u) });
  return { kv, store, assets, revoked };
}

describe("letting files go (S7)", () => {
  it("names the files no state of the history refers to", () => {
    const a = withLogo(createDesign(product), "a");
    const b = withLogo(createDesign(product), "b", "logo-2");
    expect(assetsNoLongerUsed(["a", "b", "c"], [a, null, b])).toEqual(["c"]);
    expect(assetsNoLongerUsed(["a"], [createDesign(product)])).toEqual(["a"]);
    expect(assetsNoLongerUsed(["a", "a"], [])).toEqual(["a"]);
  });

  it("deletes the stored copy, revokes the URL and forgets the name", async () => {
    const { kv, assets, revoked } = setup();
    const { assetId } = await assets.upload({ ...png, fileName: "crest.png" });
    expect(await kv.keys("assets")).toEqual([assetId]);
    const url = assets.url({ assetId })!;
    assets.release(assetId);
    await new Promise((r) => setTimeout(r, 0));
    expect(revoked).toEqual([url]);
    expect(assets.url({ assetId })).toBeNull();
    expect(assets.fileName(assetId)).toBeNull();
    expect(await kv.keys("assets")).toEqual([]);
  });

  it("as an editing session goes: uploaded, removed, undone and redone, then dropped from the history", async () => {
    const { kv, assets } = setup();
    const { assetId } = await assets.upload({ ...png, fileName: "crest.png" });
    const before = createDesign(product);
    const added = withLogo(before, assetId);
    const removed = removeLayer(added, "logo-1");
    // Removed, but undo can still bring it back: kept.
    expect(assetsNoLongerUsed(designAssetIds(added), [removed, before, added])).toEqual([]);
    // The steps that held it are gone (a new edit after undo, or the history's limit): let go.
    const gone = assetsNoLongerUsed(designAssetIds(added), [removed]);
    expect(gone).toEqual([assetId]);
    for (const id of gone) assets.release(id);
    await new Promise((r) => setTimeout(r, 0));
    expect(await kv.keys("assets")).toEqual([]);
  });

  it("restoring a saved design deletes the files it does not refer to", async () => {
    const { kv, store, assets } = setup();
    const used = await assets.upload({ ...png, fileName: "crest.png" });
    await assets.upload({ ...png, fileName: "old.png" });
    await assets.upload({ ...png, fileName: "older.png" });
    await store.saveDesign(product.id, withLogo(createDesign(product), used.assetId));
    const saved = await store.loadDesign(product);
    await store.pruneAssets();
    expect(await kv.keys("assets")).toEqual([used.assetId]);
    expect(designAssetIds(saved!.design)).toEqual([used.assetId]);
  });
});

describe("the box finding kept with the file (S3)", () => {
  it("survives a reload", async () => {
    const { store, assets } = setup();
    const { assetId } = await assets.upload({ ...png, fileName: "crest.jpg" });
    assets.saveNote(assetId, { box: true });
    await new Promise((r) => setTimeout(r, 0));
    const later = createDeviceAssetStore(store, { createUrl: () => "blob:later", revokeUrl: () => undefined });
    await later.restore([assetId]);
    expect(later.notes()).toEqual({ [assetId]: { box: true } });
    later.saveNote(assetId, { kept: true });
    await new Promise((r) => setTimeout(r, 0));
    const third = createDeviceAssetStore(store, { createUrl: () => "blob:3", revokeUrl: () => undefined });
    await third.restore([assetId]);
    expect(third.notes()[assetId]).toEqual({ box: true, kept: true });
  });
});

describe("a logo whose file is missing on this device (S2)", () => {
  it("is a check on the item and a line in the Done panel", () => {
    const d = withLogo(createDesign(product), "gone");
    const missingAssets = new Set(["gone"]);
    expect(itemChecks(product, d, d.layers[0]!, { missingAssets })).toContain("missing");
    expect(itemChecks(product, d, d.layers[0]!)).not.toContain("missing");
    expect(designChecks(W, product, d, { missingAssets }).map((c) => c.check)).toContain("missing");
  });
});
