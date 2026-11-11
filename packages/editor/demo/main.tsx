import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
// The fonts of the placeholder catalogue (samples/fonts/placeholder-fonts.json), from their npm
// packages. The host application declares the faces; the editor waits for them before trusting text.
import "@fontsource/oswald/700.css";
import "@fontsource/graduate/400.css";
import "@fontsource/noto-sans-arabic/700.css";
import { colorRefSchema, validateFontCatalog, validateProductDefinition, type FontCatalog, type ProductDefinition } from "../src";
import { Editor, type Swatch } from "./Editor";

interface DemoData {
  product: ProductDefinition;
  swatches: Swatch[];
  fonts: FontCatalog;
}

// The stand-in T-shirt (a real garment model, see samples/models/stand-in-tshirt.LICENSE.txt) by default.
// The old script-generated placeholder stays reachable for comparison: ?product=placeholder-jersey
const PRODUCTS = ["stand-in-tshirt", "placeholder-jersey"] as const;
const requested = new URLSearchParams(window.location.search).get("product");
const PRODUCT_ID = PRODUCTS.find((id) => id === requested) ?? PRODUCTS[0];
const PRODUCT_URL = `/products/${PRODUCT_ID}.json`;
// Placeholder colours, as data. The real print-tested palette (with HEX snapping) is step E3.
const PALETTE_URL = "/palettes/placeholder-palette.json";
const FONTS_URL = "/fonts/placeholder-fonts.json";

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

function App() {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The product definition, the colours and the fonts are data: fetched as JSON and validated, not imported as code.
  useEffect(() => {
    Promise.all([fetchJson(PRODUCT_URL), fetchJson(PALETTE_URL), fetchJson(FONTS_URL)])
      .then(([productJson, paletteJson, fontsJson]) => {
        const product = validateProductDefinition(productJson);
        if (!product.ok) throw new Error(product.errors.map((e) => e.message).join("; "));
        const fonts = validateFontCatalog(fontsJson);
        if (!fonts.ok) throw new Error(fonts.errors.map((e) => e.message).join("; "));
        setData({ product: product.value, swatches: readPalette(paletteJson, product.value), fonts: fonts.value });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p role="alert">Could not load the demo data: {error}</p>;
  if (!data) return <p>Loading product...</p>;
  return <Editor product={data.product} swatches={data.swatches} fonts={data.fonts} />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
