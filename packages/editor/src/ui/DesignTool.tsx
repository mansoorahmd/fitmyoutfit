/**
 * Design (06-editor.md 4.1): one card per template, each showing the garment
 * as the model does (garment-view.ts), in the team's colours with its name,
 * crest and sample player. Tap to try: one undo step; the team colours, team
 * name, logos and the coach's own choices stay.
 */
import { useEffect, useRef, useState } from "react";
import { applyTemplate, type Template } from "../design/template.js";
import type { DesignDocument } from "../design/schema.js";
import { samplerFromRgba } from "../texture/garment-view.js";
import { drawTemplateCard } from "../texture/thumbnail.js";
import { AssetImageCache } from "../react/asset-images.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";

/** The card picture's size in pixels (shown at 120 x 150 CSS px on phones, wider in a grid). */
export const CARD_WIDTH = 180;
export const CARD_HEIGHT = 225;
/** The pattern texture drawn for a card: small, enough for 180 px. */
const CARD_TEXTURE = 512;

/** One shared canvas for the cards' textures, made when first needed. */
let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
function scratchTexture() {
  if (!scratch) {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_TEXTURE;
    canvas.height = CARD_TEXTURE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    scratch = { canvas, ctx };
  }
  return scratch;
}

function TemplateCard({ template, design, previous, current, onPick, images, version }: { template: Template; design: DesignDocument; previous: Template | null; current: boolean; onPick: () => void; images: AssetImageCache; version: number }) {
  const { product, fonts, garmentView, wording } = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  // Drawn lazily, as the card scrolls into view (06-editor.md 11.3).
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !visible || !garmentView) return;
    // A short wait, so typing a team name does not redraw every card on every key.
    const timer = setTimeout(() => {
      const tex = scratchTexture();
      const ctx = canvas.getContext("2d");
      if (!tex || !ctx) return;
      const start = performance.now();
      try {
        const out = ctx.createImageData(garmentView.width, garmentView.height);
        drawTemplateCard(out.data, product, design, template, {
          fonts,
          previous,
          view: garmentView,
          images: images.lookup,
          texture: { ctx: tex.ctx, size: CARD_TEXTURE, read: () => samplerFromRgba(tex.ctx.getImageData(0, 0, CARD_TEXTURE, CARD_TEXTURE).data, CARD_TEXTURE, CARD_TEXTURE) },
        });
        ctx.putImageData(out, 0, 0);
        canvas.dataset.drawMs = (performance.now() - start).toFixed(1);
      } catch (error) {
        console.error("template card", template.id, error);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [visible, garmentView, product, design, template, fonts, previous, images, version]);

  const label = current ? `${template.name}, ${wording.templates.current}` : template.name;
  return (
    <button type="button" className="fmo-card" aria-pressed={current} aria-label={label} onClick={onPick} data-testid={`template-${template.id}`}>
      <span className="fmo-card-pic">
        <canvas ref={ref} width={garmentView?.width ?? CARD_WIDTH} height={garmentView?.height ?? CARD_HEIGHT} />
        {current && (
          <span className="fmo-card-check">
            <EditorIcon name="check" size={16} />
          </span>
        )}
      </span>
      <span className="fmo-card-name">{template.name}</span>
    </button>
  );
}

export function DesignTool() {
  const api = useEditor();
  const { templates, design, product, fonts, wording, layout, detent, assets } = api;
  const previous = templates.find((t) => t.id === design.template?.id) ?? null;
  const [version, setVersion] = useState(0);
  const [images] = useState(() => new AssetImageCache(() => setVersion((v) => v + 1)));
  useEffect(() => images.watch(design, assets.url), [images, design, assets.url]);
  const grid = layout !== "compact" || detent === "expanded";

  const pick = (template: Template) => {
    api.markTiming(`template:${template.id}`);
    const ok = api.commit((d) => applyTemplate(d, template, { product, fonts, previous: templates.find((t) => t.id === d.template?.id) ?? null }), "template");
    if (!ok) return;
    api.announce(wording.templates.changed, { undo: true, ms: 4000 });
    // In the expanded grid, a tap collapses the panel so the coach sees the result (4.1).
    if (layout === "compact" && detent === "expanded") api.setDetent("normal");
  };

  return (
    <>
      <p className="fmo-muted">{wording.templates.intro}</p>
      {!api.garmentView && <p className="fmo-muted" role="status">{wording.templates.loading}</p>}
      <div className="fmo-cards" data-grid={grid} data-testid="template-cards">
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} design={design} previous={previous} current={design.template?.id === t.id} onPick={() => pick(t)} images={images} version={version + (api.fontsLoading ? 0.5 : 0)} />
        ))}
      </div>
      <p className="fmo-muted">{wording.templates.keeps}</p>
    </>
  );
}
