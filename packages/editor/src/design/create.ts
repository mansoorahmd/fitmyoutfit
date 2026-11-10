import { DESIGN_SCHEMA_VERSION, type DesignDocument, type ProductDefinition } from "./schema.js";

/**
 * Creates an empty design for a product: every colour zone at the product's
 * default colour, no layers, no fonts, and the product's palette.
 */
export function createDesign(product: ProductDefinition): DesignDocument {
  const zones: DesignDocument["zones"] = {};
  for (const zone of product.zones) {
    zones[zone.id] = { ...zone.defaultColor };
  }
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    product: { id: product.id },
    palette: { ...product.palette },
    zones,
    fonts: [],
    layers: [],
  };
}
