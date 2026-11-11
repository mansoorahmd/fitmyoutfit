import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DesignCanvas,
  colorRefSchema,
  createDesign,
  drawPatternTexture,
  setZoneColor,
  validateDesign,
  validateProductDefinition,
  type ColorRef,
  type DesignDocument,
  type ProductDefinition,
  type TextureDrawInfo,
} from "../src";

/** A demo swatch: a palette colour reference plus a display name. */
interface Swatch {
  color: ColorRef;
  name: string;
}

interface DemoData {
  product: ProductDefinition;
  swatches: Swatch[];
}

const PRODUCT_URL = "/products/placeholder-jersey.json";
// Placeholder colours, as data. The real print-tested palette (with HEX snapping) is step E3.
const PALETTE_URL = "/palettes/placeholder-palette.json";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** Reads the placeholder palette file: each colour must be a valid colour reference. */
function readPalette(json: unknown, product: ProductDefinition): Swatch[] {
  const data = json as { id?: unknown; colors?: unknown };
  if (data.id !== product.palette.id) {
    throw new Error(`the palette file is "${String(data.id)}" but the product uses "${product.palette.id}"`);
  }
  if (!Array.isArray(data.colors)) throw new Error("the palette file has no colours");
  return data.colors.map((entry: unknown, i) => {
    const { name, ...ref } = entry as { name?: unknown };
    const parsed = colorRefSchema.safeParse(ref);
    if (!parsed.success) throw new Error(`palette colour ${i} is not a valid colour reference`);
    return { color: parsed.data, name: typeof name === "string" ? name : parsed.data.id };
  });
}

/** The pattern pieces as cut, drawn by the same function that draws the model's texture. */
function FlatPattern({ product, design }: { product: ProductDefinition; design: DesignDocument }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawPatternTexture(ctx, product, design, { size: 720, mode: "flat" });
  }, [product, design]);
  return <canvas ref={ref} width={720} height={720} className="flat-pattern" aria-label="Flat pattern pieces" />;
}

function Demo({ product, swatches }: DemoData) {
  const [design, setDesign] = useState<DesignDocument>(() => createDesign(product));
  const [drawInfo, setDrawInfo] = useState<TextureDrawInfo | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const check = validateDesign(design, { product });
  const onTextureDrawn = useCallback((info: TextureDrawInfo) => setDrawInfo(info), []);

  const pick = (zoneId: string, color: ColorRef) => {
    try {
      setDesign(setZoneColor(design, zoneId, color, { product }));
      setEditError(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="demo">
      <header className="demo-header">
        <h1>{product.name}</h1>
        <span className={check.ok ? "status-ok" : "status-bad"} data-testid="design-status">
          {check.ok ? "Design is valid" : `Design is invalid: ${check.errors[0]?.message}`}
        </span>
        {editError && <span className="status-bad">{editError}</span>}
      </header>
      <main className="demo-main">
        <div className="viewer">
          <DesignCanvas design={design} product={product} onTextureDrawn={onTextureDrawn} />
          <span className="viewer-hint">Drag to turn. Pinch or scroll to zoom.</span>
        </div>
        <aside className="panel">
          <h2>Colour zones</h2>
          <ul className="zones">
            {product.zones.map((zone) => {
              const current = design.zones[zone.id];
              return (
                <li key={zone.id} data-zone={zone.id}>
                  <div className="zone-head">
                    <span className="zone-chip" style={{ background: current?.hex }} />
                    <span className="zone-name">{zone.name}</span>
                    <span className="zone-hex">
                      {swatches.find((s) => s.color.id === current?.id)?.name ?? current?.id} {current?.hex}
                    </span>
                  </div>
                  <div className="swatches" role="group" aria-label={`Colour for ${zone.name}`}>
                    {swatches.map((swatch) => (
                      <button
                        key={swatch.color.id}
                        type="button"
                        className="swatch"
                        data-color={swatch.color.id}
                        title={`${swatch.name} ${swatch.color.hex}`}
                        aria-label={`${zone.name}: ${swatch.name}`}
                        aria-pressed={current?.id === swatch.color.id}
                        onClick={() => pick(zone.id, swatch.color)}
                        style={{ background: swatch.color.hex }}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="note">
            Placeholder colours, not print-tested.
            {drawInfo &&
              ` Texture ${drawInfo.size} x ${drawInfo.size} px, ${drawInfo.pieces} pieces, redrawn in ${drawInfo.drawMs.toFixed(1)} ms.`}
          </p>
          <details>
            <summary>Flat pattern pieces</summary>
            <FlatPattern product={product} design={design} />
            <p className="note">The same vector pieces and zones that are drawn onto the model.</p>
          </details>
          <details>
            <summary>Design JSON</summary>
            <pre className="json" data-testid="design-json">{JSON.stringify(design, null, 2)}</pre>
          </details>
        </aside>
      </main>
    </div>
  );
}

function App() {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The product definition and the colours are data: fetched as JSON and validated, not imported as code.
  useEffect(() => {
    Promise.all([fetchJson(PRODUCT_URL), fetchJson(PALETTE_URL)])
      .then(([productJson, paletteJson]) => {
        const result = validateProductDefinition(productJson);
        if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
        setData({ product: result.value, swatches: readPalette(paletteJson, result.value) });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p role="alert">Could not load the demo data: {error}</p>;
  if (!data) return <p>Loading product...</p>;
  return <Demo product={data.product} swatches={data.swatches} />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
