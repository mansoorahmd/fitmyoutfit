/**
 * Saving a design on the device (N19, 06-editor.md 9.3 and 10.6), before
 * accounts exist: the design (JSON) and its logo files in the browser's
 * IndexedDB (logo files do not fit localStorage), saved after every change
 * (debounced), so "Continue your last design?" can bring it back, logo and all.
 *
 * Optional: the host decides to use it (the demo does; the store will save to
 * accounts later). Three parts, each usable alone:
 * - `KeyValueStore`: two object stores ("designs", "assets") behind four
 *   calls; `openIndexedDbStore` (the browser) and `createMemoryKeyValueStore`
 *   (tests, and a fallback when IndexedDB is refused);
 * - `DeviceDesignStore`: the last design per product, validated on the way
 *   back in, and the logo files it uses;
 * - `createAutosave`: saves after changes (1 s after the last), and says
 *   whether the last save worked ("Saved on this device" / "Not saved").
 * Nothing runs on import.
 */
import { upgradeDesign } from "../design/upgrade.js";
import type { DesignDocument, LogoAssetRef, ProductDefinition } from "../design/schema.js";
import type { AssetUploader } from "../upload/logo-upload.js";

export type StoreName = "designs" | "assets";

export interface KeyValueStore {
  get(store: StoreName, key: string): Promise<unknown>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
}

/** An in-memory store with the same calls (tests; and when the browser refuses IndexedDB, so the editor still works). */
export function createMemoryKeyValueStore(): KeyValueStore {
  const stores: Record<StoreName, Map<string, unknown>> = { designs: new Map(), assets: new Map() };
  return {
    async get(store, key) {
      return stores[store].get(key);
    },
    async put(store, key, value) {
      stores[store].set(key, value);
    },
    async delete(store, key) {
      stores[store].delete(key);
    },
    async keys(store) {
      return [...stores[store].keys()];
    },
  };
}

/** The parts of the IndexedDB API this module uses (so a test can pass its own). */
export interface IdbFactoryLike {
  open(name: string, version?: number): IDBOpenDBRequest;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * Opens (or creates) the editor's database. Rejects when the browser refuses
 * (private browsing in some browsers, storage blocked): the caller then shows
 * "Not saved" and keeps working.
 */
export function openIndexedDbStore(name = "fitmyoutfit-editor", factory: IdbFactoryLike | undefined = typeof indexedDB !== "undefined" ? indexedDB : undefined): Promise<KeyValueStore> {
  if (!factory) return Promise.reject(new Error("this browser has no IndexedDB"));
  return new Promise((resolve, reject) => {
    let open: IDBOpenDBRequest;
    try {
      open = factory.open(name, 1);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const store of ["designs", "assets"] as const) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    open.onerror = () => reject(open.error ?? new Error("IndexedDB could not be opened"));
    open.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
    open.onsuccess = () => {
      const db = open.result;
      const run = <T>(store: StoreName, mode: IDBTransactionMode, call: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
        new Promise((done, fail) => {
          let tx: IDBTransaction;
          try {
            tx = db.transaction(store, mode);
          } catch (e) {
            fail(e instanceof Error ? e : new Error(String(e)));
            return;
          }
          let result: T;
          request(call(tx.objectStore(store))).then((r) => {
            result = r;
          }, fail);
          tx.oncomplete = () => done(result);
          tx.onerror = () => fail(tx.error ?? new Error("IndexedDB transaction failed"));
          tx.onabort = () => fail(tx.error ?? new Error("IndexedDB transaction aborted (storage full?)"));
        });
      resolve({
        get: (store, key) => run(store, "readonly", (s) => s.get(key)),
        put: async (store, key, value) => {
          await run(store, "readwrite", (s) => s.put(value, key));
        },
        delete: async (store, key) => {
          await run(store, "readwrite", (s) => s.delete(key));
        },
        keys: async (store) => (await run(store, "readonly", (s) => s.getAllKeys())).map(String),
      });
    };
  });
}

/** A saved design, as kept on the device. */
export interface SavedDesign {
  /** Version of this record (not of the design). */
  version: 1;
  productId: string;
  /** When it was saved (ms since 1970). */
  savedAt: number;
  design: DesignDocument;
  /** Whether the coach finished the start card (a design brought back never shows it again). */
  started: boolean;
}

/** A logo file kept on the device. */
export interface SavedAsset {
  bytes: Blob;
  mediaType: string;
  fileName: string;
}

export class DeviceDesignStore {
  constructor(private readonly kv: KeyValueStore) {}

  private static key(productId: string): string {
    return `last:${productId}`;
  }

  /** The last design saved for a product, upgraded and validated; null when there is none or it no longer fits the product. */
  async loadDesign(product: ProductDefinition): Promise<SavedDesign | null> {
    const raw = (await this.kv.get("designs", DeviceDesignStore.key(product.id))) as Partial<SavedDesign> | undefined;
    if (!raw || raw.version !== 1 || raw.productId !== product.id) return null;
    const checked = upgradeDesign(raw.design, { product });
    if (!checked.ok) return null;
    return { version: 1, productId: product.id, savedAt: Number(raw.savedAt) || 0, design: checked.value, started: raw.started !== false };
  }

  async saveDesign(productId: string, design: DesignDocument, options: { started?: boolean; now?: number } = {}): Promise<SavedDesign> {
    const record: SavedDesign = { version: 1, productId, savedAt: options.now ?? Date.now(), design, started: options.started ?? true };
    await this.kv.put("designs", DeviceDesignStore.key(productId), record);
    return record;
  }

  /** Forgets a product's design, and the logo files no other saved design uses ("Start again"). */
  async clearDesign(productId: string): Promise<void> {
    await this.kv.delete("designs", DeviceDesignStore.key(productId));
    await this.pruneAssets();
  }

  async putAsset(assetId: string, asset: SavedAsset): Promise<void> {
    await this.kv.put("assets", assetId, asset);
  }

  async getAsset(assetId: string): Promise<SavedAsset | null> {
    const found = (await this.kv.get("assets", assetId)) as SavedAsset | undefined;
    return found && found.bytes ? found : null;
  }

  /** Deletes logo files no saved design refers to. Returns the ids deleted. */
  async pruneAssets(): Promise<string[]> {
    const used = new Set<string>();
    for (const key of await this.kv.keys("designs")) {
      const record = (await this.kv.get("designs", key)) as Partial<SavedDesign> | undefined;
      for (const layer of record?.design?.layers ?? []) if (layer.kind === "logo" || layer.kind === "clipart") used.add(layer.asset.assetId);
    }
    const removed: string[] = [];
    for (const id of await this.kv.keys("assets")) {
      if (used.has(id)) continue;
      await this.kv.delete("assets", id);
      removed.push(id);
    }
    return removed;
  }
}

/** The ids of the logo files a design uses. */
export function designAssetIds(design: Pick<DesignDocument, "layers">): string[] {
  return [...new Set(design.layers.flatMap((l) => (l.kind === "logo" || l.kind === "clipart" ? [l.asset.assetId] : [])))];
}

/**
 * The editor's asset storage kept on the device: `upload` stores the logo's
 * bytes (and returns its id), `url` gives an object URL to draw it from, and
 * `restore` reads back the files of a saved design before it is shown.
 */
export interface DeviceAssetStore {
  upload: AssetUploader;
  url(asset: Pick<LogoAssetRef, "assetId">): string | null;
  /** The file name the coach's logo had (for "Logo: crest.png"), when known. */
  fileName(assetId: string): string | null;
  /** Loads the files with these ids from the device; returns the ids that are missing. */
  restore(assetIds: readonly string[]): Promise<string[]>;
  dispose(): void;
}

export function createDeviceAssetStore(store: DeviceDesignStore, options: { prefix?: string; createUrl?: (blob: Blob) => string | null; revokeUrl?: (url: string) => void } = {}): DeviceAssetStore {
  const urls = new Map<string, string | null>();
  const names = new Map<string, string>();
  const createUrl = options.createUrl ?? ((blob: Blob) => (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null));
  const revokeUrl = options.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const prefix = options.prefix ?? "device";
  let counter = 0;
  return {
    async upload(request) {
      counter++;
      const assetId = `${prefix}-${Date.now().toString(36)}-${counter}`;
      const bytes = new Blob([request.bytes as BlobPart], { type: request.mediaType });
      await store.putAsset(assetId, { bytes, mediaType: request.mediaType, fileName: request.fileName });
      urls.set(assetId, createUrl(bytes));
      names.set(assetId, request.fileName);
      return { assetId };
    },
    url(asset) {
      return urls.get(asset.assetId) ?? null;
    },
    fileName(assetId) {
      return names.get(assetId) || null;
    },
    async restore(assetIds) {
      const missing: string[] = [];
      for (const id of assetIds) {
        if (urls.has(id)) continue;
        const saved = await store.getAsset(id);
        if (!saved) {
          missing.push(id);
          continue;
        }
        urls.set(id, createUrl(saved.bytes));
        if (saved.fileName) names.set(id, saved.fileName);
      }
      return missing;
    },
    dispose() {
      for (const url of urls.values()) if (url) revokeUrl(url);
      urls.clear();
    },
  };
}

/** The save state the top bar shows: saving, saved, or the last save failed (06-editor.md 10.6). */
export type SaveState = "saving" | "saved" | "failed";

export interface Autosave {
  /** A new version of the design: saved `delayMs` after the last call. */
  schedule(design: DesignDocument): void;
  /** Saves now what is waiting (before leaving, or "Done"). Resolves when saved; rejects when the save failed. */
  flush(): Promise<void>;
  /** Stops the timer (what is waiting is not saved). */
  dispose(): void;
  readonly state: SaveState | null;
}

/** Saves a design after changes, debounced (06-editor.md 9.3: 1 s). */
export function createAutosave(options: {
  save: (design: DesignDocument) => Promise<unknown>;
  delayMs?: number;
  onState?: (state: SaveState) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): Autosave {
  const delay = options.delayMs ?? 1000;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let pending: DesignDocument | null = null;
  let timer: unknown = null;
  let state: SaveState | null = null;
  let running: Promise<void> = Promise.resolve();
  const set = (next: SaveState) => {
    state = next;
    options.onState?.(next);
  };
  const run = (): Promise<void> => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    const design = pending;
    pending = null;
    if (!design) return running;
    // One save at a time, in order: the later save always wins.
    running = running
      .catch(() => undefined)
      .then(() => options.save(design))
      .then(
        () => {
          if (pending === null && timer === null) set("saved");
        },
        (error: unknown) => {
          set("failed");
          throw error;
        },
      );
    return running;
  };
  return {
    schedule(design) {
      pending = design;
      if (state !== "saving") set("saving");
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        run().catch(() => undefined);
      }, delay);
    },
    flush: () => run(),
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending = null;
    },
    get state() {
      return state;
    },
  };
}

/**
 * Tells other tabs a product's design was saved, and listens for theirs
 * (06-editor.md 10.6: "This design changed in another tab."). Null where the
 * browser has no BroadcastChannel.
 */
export function watchOtherTabs(productId: string, onOtherSave: (savedAt: number) => void): { announce(savedAt: number): void; close(): void } | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const tab = Math.random().toString(36).slice(2);
  const channel = new BroadcastChannel("fitmyoutfit-editor");
  channel.onmessage = (event: MessageEvent<{ productId?: string; tab?: string; savedAt?: number }>) => {
    const data = event.data;
    if (data?.productId === productId && data.tab !== tab) onOtherSave(Number(data.savedAt) || Date.now());
  };
  return {
    announce: (savedAt) => channel.postMessage({ productId, tab, savedAt }),
    close: () => channel.close(),
  };
}
