/**
 * Loads the images of a design's logo and clipart layers from URLs the host
 * gives (`assetUrl`), and tells the caller when one arrives so the texture
 * is redrawn with it. Images are loaded with CORS ("anonymous"), because a
 * canvas that drew a cross-origin image without it can no longer be
 * uploaded to the GPU.
 */
import type { AssetRef, DesignDocument } from "../design/schema.js";

export type AssetUrlResolver = (asset: AssetRef) => string | null | undefined;

interface Entry {
  url: string;
  image: HTMLImageElement;
  state: "loading" | "ready" | "failed";
}

export class AssetImageCache {
  private readonly entries = new Map<string, Entry>();
  private disposed = false;

  constructor(private readonly onChange: () => void) {}

  /** Starts loading the images the design uses. */
  watch(design: DesignDocument, resolve: AssetUrlResolver | undefined): void {
    if (!resolve || typeof Image === "undefined") return;
    for (const layer of design.layers) {
      if (layer.kind !== "logo" && layer.kind !== "clipart") continue;
      const url = resolve(layer.asset);
      if (!url) continue;
      const key = layer.asset.assetId;
      const current = this.entries.get(key);
      if (current && current.url === url) continue;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      const entry: Entry = { url, image, state: "loading" };
      image.onload = () => {
        entry.state = "ready";
        if (!this.disposed) this.onChange();
      };
      image.onerror = () => {
        entry.state = "failed";
        if (!this.disposed) this.onChange();
      };
      image.src = url;
      this.entries.set(key, entry);
    }
  }

  /** The loaded image for an asset, or null while it loads (or when it failed). */
  readonly lookup = (asset: AssetRef): HTMLImageElement | null => {
    const entry = this.entries.get(asset.assetId);
    return entry?.state === "ready" ? entry.image : null;
  };

  /** Asset ids whose image failed to load. */
  failed(): string[] {
    return [...this.entries].filter(([, e]) => e.state === "failed").map(([id]) => id);
  }

  dispose(): void {
    this.disposed = true;
    this.entries.clear();
  }
}
