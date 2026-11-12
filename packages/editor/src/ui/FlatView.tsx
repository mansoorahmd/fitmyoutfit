/**
 * The flat view (06-editor.md 10.3): when 3D cannot run, the front and the
 * back side by side with the sleeves under them, drawn by the same function
 * that paints the model. Static in E3a: every tool still works (colours,
 * designs, names, numbers, logos, text); dragging in the flat view is later.
 */
import { useEffect, useRef, useState } from "react";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import { flatViewProduct } from "../texture/flat-view.js";
import { drawPatternTexture } from "../texture/pattern-texture.js";
import { AssetImageCache, type AssetUrlResolver } from "../react/asset-images.js";

export function FlatView({ product, design, assetUrl, captions, label }: { product: ProductDefinition; design: DesignDocument; assetUrl: AssetUrlResolver; captions: { front: string; back: string }; label: string }) {
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

  const layout = size.width > 0 && size.height > 0 ? flatViewProduct(product, { width: size.width, height: size.height - 20 }) : null;
  useEffect(() => {
    const el = canvas.current;
    if (!el || !layout) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    el.width = Math.round(size.width * dpr);
    el.height = Math.round(size.height * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    const scaled = { ...layout.product, pieces: layout.product.pieces.map((p) => ({ ...p, uv: { x: p.uv.x, y: (p.uv.y * layout.size + 20) / layout.size, width: p.uv.width, height: p.uv.height } })) };
    // Draw at device pixels: the layout is in CSS pixels, so scale the square drawing.
    const drawSize = layout.size * dpr;
    const deviceProduct = { ...scaled, pieces: scaled.pieces.map((p) => ({ ...p })) };
    drawPatternTexture(ctx, deviceProduct, design, { size: drawSize, mode: "flat", images: images.lookup });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#4a5468";
    ctx.font = `${13 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const place of layout.places) {
      const caption = place.pieceId === product.views.front ? captions.front : place.pieceId === product.views.back ? captions.back : null;
      if (caption) ctx.fillText(caption, (place.x + place.width / 2) * dpr, 2 * dpr);
    }
  }, [layout, design, images, version, size, product, captions]);

  return (
    <div ref={box} className="fmo-flat" role="img" aria-label={label} data-testid="flat-view">
      <canvas ref={canvas} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
