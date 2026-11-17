/**
 * Design (06-editor.md 4.1): one card per template, each showing the garment
 * as the model does (garment-view.ts), in the team's colours with its name,
 * crest and sample player. Tap to try: one undo step; the team colours, team
 * name, logos and the coach's own choices stay.
 */
import { useEffect, useRef, useState, memo } from "react";
import { applyTemplate, type Template } from "../design/template.js";
import type { DesignDocument } from "../design/schema.js";
import { samplerFromRgba } from "../texture/garment-view.js";
import { drawDesignView } from "../texture/thumbnail.js";
import { AssetImageCache } from "../react/asset-images.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";

/** The card picture's size in pixels (shown at 120 x 150 CSS px on phones, wider in a grid). */
export const CARD_WIDTH = 180;
export const CARD_HEIGHT = 225;
/** The pattern texture drawn for a card: small, enough for 180 px. */
const CARD_TEXTURE = 512;

/**
 * Card drawing runs one card per task (a short queue), so a change never blocks the page for all cards
 * at once; a card whose picture would not change is not drawn again.
 */
const queue: Array<() => void> = [];
let pumping = false;
/** When the browser is idle (S1: the cards stay off the path of a tap), else on the next task. */
function later(fn: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(fn, { timeout: 3000 });
  else setTimeout(fn, 0);
}

function scheduleCard(job: () => void): void {
  queue.push(job);
  if (pumping) return;
  pumping = true;
  const pump = () => {
    const next = queue.shift();
    if (!next) {
      pumping = false;
      return;
    }
    next();
    later(pump);
  };
  later(pump);
}

/** The inside of the garment (seen through the neck) is drawn without prints, small (E3c). */
const CARD_INSIDE_TEXTURE = 128;

/** Shared canvases for the cards' textures (the outside, and the inside), made when first needed. */
const scratches = new Map<number, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();
function scratchTexture(size = CARD_TEXTURE) {
  let scratch = scratches.get(size);
  if (!scratch) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    scratch = { canvas, ctx };
    scratches.set(size, scratch);
  }
  return scratch;
}

function TemplateCard({ template, design, previous, current, onPick, images, version }: { template: Template; design: DesignDocument; previous: Template | null; current: boolean; onPick: () => void; images: AssetImageCache; version: number }) {
  const { product, fonts, garmentView, wording, readable } = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const drawn = useRef<string | null>(null);

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
    let cancelled = false;
    // A short wait, so typing a team name does not redraw every card on every key.
    const timer = setTimeout(() => {
      // Applying the template is work too: it waits for the browser to be idle, as the drawing does (S1).
      scheduleCard(() => {
        if (cancelled) return;
        let applied: DesignDocument;
        try {
          applied = applyTemplate(design, template, { product, fonts, previous });
          // As a tap would apply it: names and numbers readable (B4).
          if (readable) applied = readable(applied);
        } catch (error) {
          console.error("template card", template.id, error);
          return;
        }
        // The same picture as last time (after a tap, most cards do not change): nothing to draw.
        const key = `${version}|${JSON.stringify(applied)}`;
        if (key === drawn.current) return;
        // The drawing is its own idle job (S1: shorter jobs, so a tap is not kept waiting behind a card).
        scheduleCard(() => {
        if (cancelled) return;
        const tex = scratchTexture();
        const insideTex = scratchTexture(CARD_INSIDE_TEXTURE);
        const ctx = canvas.getContext("2d");
        if (cancelled || !tex || !ctx) return;
        const start = performance.now();
        try {
          const out = ctx.createImageData(garmentView.width, garmentView.height);
          drawDesignView(out.data, product, applied, {
            view: garmentView,
            images: images.lookup,
            texture: { ctx: tex.ctx, size: CARD_TEXTURE, read: () => samplerFromRgba(tex.ctx.getImageData(0, 0, CARD_TEXTURE, CARD_TEXTURE).data, CARD_TEXTURE, CARD_TEXTURE) },
            ...(insideTex ? { insideTexture: { ctx: insideTex.ctx, size: CARD_INSIDE_TEXTURE, read: () => samplerFromRgba(insideTex.ctx.getImageData(0, 0, CARD_INSIDE_TEXTURE, CARD_INSIDE_TEXTURE).data, CARD_INSIDE_TEXTURE, CARD_INSIDE_TEXTURE) } } : {}),
          });
          ctx.putImageData(out, 0, 0);
          drawn.current = key;
          canvas.dataset.drawMs = (performance.now() - start).toFixed(1);
        } catch (error) {
          console.error("template card", template.id, error);
        }
        });
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, garmentView, product, design, template, fonts, previous, images, version, readable]);

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

function DesignToolView() {
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

/** E3d (speed): re-renders only when its props or the editor's data change. */
export const DesignTool = memo(DesignToolView);
