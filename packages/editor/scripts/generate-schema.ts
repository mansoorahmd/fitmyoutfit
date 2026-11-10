// Writes the JSON Schema files in schema/ from the zod schemas.
// The test src/design/json-schema.test.ts fails when these files are stale.
// Usage: npm run generate:schema
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDesignJsonSchema, getProductJsonSchema } from "../src/design/json-schema";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../schema");
mkdirSync(dir, { recursive: true });
for (const [name, schema] of [
  ["design.schema.json", getDesignJsonSchema()],
  ["product.schema.json", getProductJsonSchema()],
] as const) {
  writeFileSync(resolve(dir, name), JSON.stringify(schema, null, 2) + "\n");
  console.log(`Wrote schema/${name}`);
}
