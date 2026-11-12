import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
// The fonts of the placeholder catalogue (samples/fonts/placeholder-fonts.json), from their npm
// packages. The host application declares the faces; the editor waits for them before trusting text.
import "@fontsource/oswald/700.css";
import "@fontsource/graduate/400.css";
import "@fontsource/noto-sans-arabic/700.css";
import {
  coloursCommonFirst,
  paletteColourRef,
  validateFontCatalog,
  validatePalette,
  validateProductDefinition,
  validateTemplate,
  type FontCatalog,
  type Palette,
  type ProductDefinition,
  type Template,
} from "../src";
import { Editor, type Swatch } from "./Editor";
import { chooseProduct } from "./products";

interface DemoData {
  product: ProductDefinition;
  swatches: Swatch[];
  palette: Palette;
  fonts: FontCatalog;
  templates: Template[];
}

// The stand-in football jersey (see samples/models/stand-in-jersey.LICENSE.txt) by default. The stand-in
// T-shirt and the old script-generated placeholder stay reachable: ?product=stand-in-tshirt,
// ?product=placeholder-jersey (and the switch in the header).
const DEMO_PRODUCT = chooseProduct(window.location.search);
const PRODUCT_URL = `/products/${DEMO_PRODUCT.id}.json`;
// Placeholder colours, as data, NOT print-tested: the founders' print-tested palette replaces the file.
const PALETTE_URL = "/palettes/placeholder-palette.json";
const FONTS_URL = "/fonts/placeholder-fonts.json";

// The product's sample templates (samples/templates/<product>/index.json lists them); none for the placeholder.
const TEMPLATES_URL = `/templates/${DEMO_PRODUCT.id}`;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** Reads the placeholder palette file (validated as a palette). */
function readPalette(json: unknown, product: ProductDefinition): Palette {
  const palette = validatePalette(json);
  if (!palette.ok) throw new Error(palette.errors.map((e) => e.message).join("; "));
  if (palette.value.id !== product.palette.id) {
    throw new Error(`the palette file is "${palette.value.id}" but the product uses "${product.palette.id}"`);
  }
  return palette.value;
}

/** The product's templates, each validated against the product and the fonts; none when the product has no index. */
async function loadTemplates(product: ProductDefinition, fonts: FontCatalog): Promise<Template[]> {
  const response = await fetch(`${TEMPLATES_URL}/index.json`);
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return [];
  const index = (await response.json()) as { templates: string[] };
  return Promise.all(
    index.templates.map(async (id) => {
      const checked = validateTemplate(await fetchJson(`${TEMPLATES_URL}/${id}.json`), { product, fonts });
      if (!checked.ok) throw new Error(`template ${id}: ${checked.errors.map((e) => e.message).join("; ")}`);
      return checked.value;
    }),
  );
}

function App() {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The product definition, the colours and the fonts are data: fetched as JSON and validated, not imported as code.
  useEffect(() => {
    Promise.all([fetchJson(PRODUCT_URL), fetchJson(PALETTE_URL), fetchJson(FONTS_URL)])
      .then(async ([productJson, paletteJson, fontsJson]) => {
        const product = validateProductDefinition(productJson);
        if (!product.ok) throw new Error(product.errors.map((e) => e.message).join("; "));
        const fonts = validateFontCatalog(fontsJson);
        if (!fonts.ok) throw new Error(fonts.errors.map((e) => e.message).join("; "));
        const palette = readPalette(paletteJson, product.value);
        const swatches = coloursCommonFirst(palette).map((c) => ({ color: paletteColourRef(c), name: c.name }));
        const templates = await loadTemplates(product.value, fonts.value);
        setData({ product: product.value, swatches, palette, fonts: fonts.value, templates });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p role="alert">Could not load the demo data: {error}</p>;
  if (!data) return <p>Loading product...</p>;
  return <Editor product={data.product} swatches={data.swatches} palette={data.palette} fonts={data.fonts} templates={data.templates} demoProduct={DEMO_PRODUCT} />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
