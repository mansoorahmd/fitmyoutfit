import { z } from "zod";
import { designSchema, productDefinitionSchema } from "./schema.js";
import { fontCatalogSchema } from "./font-catalog.js";

type JsonSchema = Record<string, unknown>;

function build(schema: z.ZodType, id: string, title: string): JsonSchema {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }) as JsonSchema;
  const { $schema, ...rest } = generated;
  return { $schema, $id: id, title, ...rest };
}

/** JSON Schema (draft 2020-12) for a design document, generated from the same zod schema as the types. */
export function getDesignJsonSchema(): JsonSchema {
  return build(designSchema, "https://fitmyoutfit.example/schemas/design.schema.json", "FitMyOutfit design document");
}

/** JSON Schema (draft 2020-12) for a product definition. */
export function getProductJsonSchema(): JsonSchema {
  return build(
    productDefinitionSchema,
    "https://fitmyoutfit.example/schemas/product.schema.json",
    "FitMyOutfit product definition",
  );
}

/** JSON Schema (draft 2020-12) for a font catalogue. */
export function getFontCatalogJsonSchema(): JsonSchema {
  return build(fontCatalogSchema, "https://fitmyoutfit.example/schemas/font-catalog.schema.json", "FitMyOutfit font catalogue");
}
