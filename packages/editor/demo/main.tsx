import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DesignCanvas,
  createDesign,
  setZoneColor,
  validateDesign,
  validateProductDefinition,
  type ColorRef,
  type DesignDocument,
  type ProductDefinition,
} from "../src";

// Placeholder swatches for the demo only. The real, print-tested palette is a later task.
const SWATCHES: ColorRef[] = [
  { id: "placeholder-white", hex: "#FFFFFF" },
  { id: "placeholder-black", hex: "#111111" },
  { id: "placeholder-navy", hex: "#1B2A5C" },
  { id: "placeholder-red", hex: "#C8102E" },
  { id: "placeholder-green", hex: "#0B6B3A" },
  { id: "placeholder-gold", hex: "#F2B705" },
];

function Demo({ product }: { product: ProductDefinition }) {
  const [design, setDesign] = useState<DesignDocument>(() => createDesign(product));
  const [zoneId, setZoneId] = useState(product.zones[0]?.id ?? "");
  const check = validateDesign(design, { product });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{product.name}</strong>
        <label>
          Zone{" "}
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {product.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>
        <span style={{ display: "flex", gap: 6 }}>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              title={`${swatch.id} ${swatch.hex}`}
              aria-label={`Set ${zoneId} to ${swatch.id}`}
              onClick={() => setDesign((current) => setZoneColor(current, zoneId, swatch))}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                border: design.zones[zoneId]?.id === swatch.id ? "3px solid #09f" : "1px solid #888",
                background: swatch.hex,
                cursor: "pointer",
              }}
            />
          ))}
        </span>
        <span>{check.ok ? "Design is valid" : `Design is invalid: ${check.errors[0]?.message}`}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: "#eef1f5" }}>
        <DesignCanvas design={design} product={product} />
      </div>
      <pre style={{ margin: 0, padding: 12, maxHeight: 160, overflow: "auto", borderTop: "1px solid #ddd", fontSize: 12 }}>
        {JSON.stringify(design, null, 2)}
      </pre>
    </div>
  );
}

function App() {
  const [product, setProduct] = useState<ProductDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The product definition is data: fetched as JSON and validated, not imported as code.
  useEffect(() => {
    fetch("/products/placeholder-jersey.json")
      .then((response) => response.json() as Promise<unknown>)
      .then((json) => {
        const result = validateProductDefinition(json);
        if (result.ok) setProduct(result.value);
        else setError(result.errors.map((e) => e.message).join("; "));
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) return <p role="alert">Could not load the product: {error}</p>;
  if (!product) return <p>Loading product...</p>;
  return <Demo product={product} />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
