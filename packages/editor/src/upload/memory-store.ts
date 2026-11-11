/**
 * An in-memory asset store, for the demo and for tests: it plays the host's
 * part (store the uploaded file, return an id, give a URL to draw it from).
 * The store's real storage replaces it; nothing here is used in production.
 */
import type { AssetRef } from "../design/schema.js";
import type { AssetUploadRequest, AssetUploader } from "./logo-upload.js";

export interface MemoryAssetStore {
  upload: AssetUploader;
  /** A URL to draw the asset from (an object URL), or null when the id is unknown. */
  url(asset: Pick<AssetRef, "assetId">): string | null;
  /** The stored request, for tests. */
  get(assetId: string): AssetUploadRequest | undefined;
  /** Frees the object URLs. */
  dispose(): void;
}

export function createMemoryAssetStore(prefix = "mem"): MemoryAssetStore {
  const files = new Map<string, { request: AssetUploadRequest; url: string | null }>();
  let counter = 0;
  return {
    async upload(request) {
      counter++;
      const assetId = `${prefix}-${Date.now().toString(36)}-${counter}`;
      const blob = new Blob([request.bytes as BlobPart], { type: request.mediaType });
      const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
      files.set(assetId, { request: { ...request, bytes: request.bytes.slice() }, url });
      return { assetId };
    },
    url(asset) {
      return files.get(asset.assetId)?.url ?? null;
    },
    get(assetId) {
      return files.get(assetId)?.request;
    },
    dispose() {
      for (const { url } of files.values()) if (url) URL.revokeObjectURL(url);
      files.clear();
    },
  };
}
