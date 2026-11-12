/**
 * The flat view (06-editor.md 10.3): when 3D cannot run, the garment seen
 * from the front and from the back, side by side, drawn without WebGL by the
 * same software render the design cards use (garment-view.ts: the model's
 * triangles rasterised once per size, the design's pattern texture looked up
 * through them). So it looks like the jersey, sleeves and collar included,
 * not like the flat front piece (which, for the stand-in jersey's front that
 * wraps round under the side panels, read like a dress).
 *
 * Every tool still works (colours, designs, names, numbers, logos, text);
 * tapping an item selects it (10.3: a 2D hit test through the view's UVs);
 * moving is by the presets and the fine-tune controls (drag here is later).
 *
 * Until the model's geometry has been read (or if it cannot be), the pieces
 * are drawn flat as cut, as before.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { pieceAtUv } from "../design/pattern.js";
import { layerAtPoint } from "../design/placement.js";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import { flatViewProduct } from "../texture/flat-view.js";
import { composeGarmentView, renderGarmentView, samplerFromRgba, type GarmentMesh, type GarmentView } from "../texture/garment-view.js";
import { drawPatternTexture } from "../texture/pattern-texture.js";
import { AssetImageCache, type AssetUrlResolver } from "../react/asset-images.js";

/** The pattern texture the views look up: enough for a phone-sized view. */
const FLAT_TEXTURE = 1024;
/** The inside's texture (zones only): small, it is only seen in shade through the neck. */
const INSIDE_TEXTURE = 256;
/** Room for the captions over the views (CSS px). */
const CAPTION = 20;
/** How far outside an item's box a tap still selects it (mm): fingers are wide. */
const TAP_SLOP_MM = 8;

export interface FlatViewProps {
  product: ProductDefinition;
  design: DesignDocument;
  assetUrl: AssetUrlResolver;
  captionFront: string;
  captionBack: string;
  label: string;
  /** The garment's meshes (from the loaded model; no WebGL needed). Null: the pieces are drawn flat. */
  garment?: readonly GarmentMesh[] | null;
  selectedLayerId?: string | null;
  /** A tap on an item (its id) or on empty fabric or the background (null). */
  onSelectLayer?: (layerId: string | null) => void;
}

export interface FlatPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the two views sit in the box (CSS px), each under its caption: side
 * by side, or one above the other, whichever shows the garment larger (on a
 * phone in portrait the box is tall and narrow, so stacked wins; on a desktop,
 * side by side). Each place is the garment's own box (`aspect` is its width
 * over its height), so the caption sits just above the garment.
 */
export function flatViewPlaces(width: number, height: number, aspect = 1): { front: FlatPlace; back: FlatPlace; stacked: boolean } {
  const gap = Math.round(Math.min(width, height) * 0.03);
  const fit = (w: number, h: number) => {
    const gh = Math.max(1, Math.min(h, w / aspect));
    return { w: Math.max(1, Math.floor(gh * aspect)), h: Math.max(1, Math.floor(gh)) };
  };
  const side = fit((width - gap) / 2, height - CAPTION);
  const stack = fit(width, (height - gap) / 2 - CAPTION);
  const stacked = stack.h > side.h;
  if (stacked) {
    const top = Math.max(0, Math.round((height - 2 * (stack.h + CAPTION) - gap) / 2));
    const x = Math.round((width - stack.w) / 2);
    return { stacked, front: { x, y: top + CAPTION, ...stack }, back: { x, y: top + 2 * CAPTION + stack.h + gap, ...stack } };
  }
  const left = Math.max(0, Math.round((width - 2 * side.w - gap) / 2));
  const y = Math.max(CAPTION, Math.round((height - side.h - CAPTION) / 2) + CAPTION);
  return { stacked, front: { x: left, y, ...side }, back: { x: left + side.w + gap, y, ...side } };
}

/** The garment's width over its height, seen from the front (for laying out the views). */
export function garmentAspect(meshes: readonly GarmentMesh[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of meshes) {
    const p = mesh.positions;
    for (let k = 0; k + 2 < p.length; k += 3) {
      minX = Math.min(minX, p[k]!);
      maxX = Math.max(maxX, p[k]!);
      minY = Math.min(minY, p[k + 1]!);
      maxY = Math.max(maxY, p[k + 1]!);
    }
  }
  return maxX > minX && maxY > minY ? (maxX - minX) / (maxY - minY) : 1;
}

/** The design's item under a point of a view (CSS px inside the view), or null. */
export function itemAtViewPoint(product: ProductDefinition, design: DesignDocument, view: GarmentView, x: number, y: number, slopMm = TAP_SLOP_MM): { pieceId: string; layerId: string | null } | null {
  const ss = view.supersample;
  const sx = Math.floor(x * ss);
  const sy = Math.floor(y * ss);
  const W = view.width * ss;
  if (sx < 0 || sy < 0 || sx >= W || sy >= view.height * ss) return null;
  const at = sy * W + sx;
  if (view.kind[at] !== 1) return null;
  const hit = pieceAtUv(product, { u: view.u[at]!, v: view.v[at]! });
  if (!hit) return null;
  return { pieceId: hit.piece.id, layerId: layerAtPoint(design, hit.piece.id, hit.point, slopMm)?.id ?? null };
}

export function FlatView({ product, design, assetUrl, captionFront, captionBack, label, garment = null, selectedLayerId = null, onSelectLayer }: FlatViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [version, setVersion] = useState(0);
  const [images] = useState(() => new AssetImageCache(() => setVersion((v) => v + 1)));
  useEffect(() => images.watch(design, assetUrl), [images, design, assetUrl]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Text is redrawn when the fonts arrive.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    const bump = () => setVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);

  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  // The garment's two views, rasterised once per size (no WebGL). Sharp at the device's pixels; smoothed
  // edges from four samples per pixel on a 1x screen, one on a 2x screen (the same number of samples).
  const views = useMemo(() => {
    if (!garment || garment.length === 0 || size.width < 40 || size.height < 60) return null;
    const places = flatViewPlaces(size.width, size.height, garmentAspect(garment));
    const ss = dpr >= 2 ? 1 : 2;
    const make = (side: "front" | "back") => renderGarmentView(garment, { width: Math.round(places[side].w * dpr), height: Math.round(places[side].h * dpr), side, supersample: ss });
    try {
      return { places, front: make("front"), back: make("back") };
    } catch (error) {
      console.error("[editor] flat view:", error);
      return null;
    }
  }, [garment, size.width, size.height, dpr]);

  const flatLayout = useMemo(() => (!views && size.width > 0 && size.height > 0 ? flatViewProduct(product, { width: size.width, height: size.height - CAPTION }) : null), [views, product, size.width, size.height]);

  // One reusable canvas for the pattern texture the views look up.
  const [scratch] = useState(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = FLAT_TEXTURE;
    c.height = FLAT_TEXTURE;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    return ctx ? { canvas: c, ctx } : null;
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el || size.width === 0) return;
    el.width = Math.round(size.width * dpr);
    el.height = Math.round(size.height * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.fillStyle = "#4a5468";
    ctx.font = `${13 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (views && scratch) {
      drawPatternTexture(scratch.ctx, product, design, { size: FLAT_TEXTURE, images: images.lookup, selectedLayerId });
      const sampler = samplerFromRgba(scratch.ctx.getImageData(0, 0, FLAT_TEXTURE, FLAT_TEXTURE).data, FLAT_TEXTURE, FLAT_TEXTURE);
      // The inside (seen through the neck) without the prints, as the 3D view draws it.
      drawPatternTexture(scratch.ctx, product, { ...design, layers: [] }, { size: INSIDE_TEXTURE });
      const inside = samplerFromRgba(scratch.ctx.getImageData(0, 0, INSIDE_TEXTURE, INSIDE_TEXTURE).data, INSIDE_TEXTURE, INSIDE_TEXTURE);
      for (const side of ["front", "back"] as const) {
        const view = views[side];
        const place = views.places[side];
        const image = ctx.createImageData(view.width, view.height);
        composeGarmentView(view, sampler, image.data, inside);
        ctx.putImageData(image, Math.round(place.x * dpr), Math.round(place.y * dpr));
        ctx.fillText(side === "front" ? captionFront : captionBack, (place.x + place.w / 2) * dpr, (place.y - CAPTION + 2) * dpr);
      }
      return;
    }
    if (!flatLayout) return;
    const scaled = { ...flatLayout.product, pieces: flatLayout.product.pieces.map((p) => ({ ...p, uv: { x: p.uv.x, y: (p.uv.y * flatLayout.size + CAPTION) / flatLayout.size, width: p.uv.width, height: p.uv.height } })) };
    drawPatternTexture(ctx, scaled, design, { size: flatLayout.size * dpr, mode: "flat", images: images.lookup, selectedLayerId });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const place of flatLayout.places) {
      const caption = place.pieceId === product.views.front ? captionFront : place.pieceId === product.views.back ? captionBack : null;
      if (caption) ctx.fillText(caption, (place.x + place.width / 2) * dpr, 2 * dpr);
    }
  }, [views, flatLayout, scratch, design, images, version, size, product, captionFront, captionBack, dpr, selectedLayerId]);

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onSelectLayer || !views) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    for (const side of ["front", "back"] as const) {
      const p = views.places[side];
      if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) {
        const hit = itemAtViewPoint(product, design, views[side], (x - p.x) * dpr, (y - p.y) * dpr, TAP_SLOP_MM);
        onSelectLayer(hit?.layerId ?? null);
        return;
      }
    }
    onSelectLayer(null);
  };

  return (
    <div ref={box} className="fmo-flat-box" role="img" aria-label={label} data-testid="flat-view" data-garment={views ? "true" : "false"} data-places={views ? JSON.stringify({ front: views.places.front, back: views.places.back }) : undefined} onPointerUp={onPointerUp}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
