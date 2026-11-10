# @fitmyoutfit/editor

The 3D design editor for the store. It is a standalone React + Three.js package: no Medusa, no Next.js. The storefront embeds it; a future platform could reuse it.

**A design is data, not an image.** A design is a versioned JSON document. Previews, proof renders and production files are all generated from it, so it never holds flattened pixels.

Status: foundation only (Sprint 0). The document format below is a **first draft** (`schemaVersion` 1) that the week 3 to 12 work will extend.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Demo page at http://localhost:5173 |
| `npm run build` | Library build to `dist/` (ES modules and `.d.ts`), then checks the entry points |
| `npm run build:demo` | Builds the demo page to `dist-demo/` (not part of the library) |
| `npm run lint` / `typecheck` / `test` | ESLint, `tsc --noEmit`, Vitest (runs once) |
| `npm run generate:schema` | Rewrites `schema/*.json` from the zod schemas |
| `npm run generate:model` | Rewrites the placeholder GLB from `scripts/generate-placeholder-jersey.mjs` |

## Using it

```ts
// The React component (loads React, Three.js, react-three-fiber)
import { DesignCanvas } from "@fitmyoutfit/editor";

// Only the document functions and types (zod is the only import: no React, no Three.js).
// Use this on the server, for example in the backend, to validate designs.
import { createDesign, validateDesign, setZoneColor } from "@fitmyoutfit/editor/design";

// The JSON Schema files
import designSchema from "@fitmyoutfit/editor/design.schema.json";
```

```tsx
<DesignCanvas design={design} product={product} style={{ height: 480 }} />
```

The package is ESM only and its type declarations use extensionless imports, so it needs a bundler (Next.js, Vite) or `moduleResolution: "bundler"`. In Next.js, render `DesignCanvas` from a client component. Nothing in the package touches `window` or `document` when imported, so importing it on the server is safe.

`react`, `react-dom` and `three` are peer dependencies. `@react-three/fiber`, `@react-three/drei` and `zod` are normal dependencies.

## The design document

One source of truth: the zod schemas in `src/design/schema.ts`. The TypeScript types are inferred from them (`DesignDocument`, `Layer`, ...) and the JSON Schema files in `schema/` are generated from them (`npm run generate:schema`). A test fails if a committed schema file is stale, and another runs the committed JSON Schema (with Ajv) and the code validator over the same documents to check they agree.

```jsonc
{
  "schemaVersion": 1,
  "product": { "id": "placeholder-jersey" },
  "palette": { "id": "placeholder-palette", "version": 1 },
  "zones": { "body": { "id": "placeholder-white", "hex": "#FFFFFF" } },
  "fonts": [{ "id": "font-sans", "family": "Inter", "weight": 700 }],
  "layers": [
    {
      "id": "text-1", "kind": "text", "pieceId": "front",
      "position": { "x": 280, "y": 250 }, "size": { "width": 400, "height": 80 }, "rotation": 0,
      "value": "TIGERS", "fontId": "font-sans", "fontSize": 60,
      "fill": { "id": "placeholder-red", "hex": "#C8102E" }, "align": "center"
    }
  ]
}
```

Layer kinds: `text` and `number` (value, font, size, fill, alignment), and `logo` and `clipart` (an `asset` reference). Layers are listed bottom to top.

### Pattern-piece coordinates

- A **pattern piece** is a flat 2D panel of the garment (front, back, a sleeve). Its size is in the product definition.
- Units are **millimetres**, at real garment scale, never screen pixels or UV values.
- The origin is the piece's **top-left corner**, X to the right, **Y down** (the same orientation as SVG and as glTF UVs).
- A layer's `position` is its **centre**. `size` is its unrotated box. `rotation` is in **degrees, clockwise**, about the centre.
- A product definition maps each piece to a mesh in the model and to a rectangle in the model's UV space (`uv`: x, y, width, height, glTF convention, origin top-left). Piece to UV is then a linear map: `u = uv.x + (px / piece.width) * uv.width`, and the same for V. The 3D view and the proof renders use that map; the stored numbers never change.
- `fontSize` is the em size in mm.

### Colours

A colour is `{ "id": "<palette colour id>", "hex": "#RRGGBB" }`: a palette reference plus the HEX copied from the palette when it was picked. HEX is always **upper case, 6 digits**. Storing the HEX makes the document renderable without the palette and keeps old designs readable if a palette later changes; the document-level `palette` (id and version) says which palette the ids belong to. Zones hold one colour each, keyed by zone id. Fonts, text fills and zones all use the same colour shape.

### Assets and vectors

`logo` and `clipart` layers hold `asset: { assetId, mediaType }`, a reference to a file in asset storage. SVG stays SVG; PNG and JPEG are kept as the original file. Nothing is rasterised or re-encoded into the document. A text layer stays text (value, font reference), not outlines.

### Functions (`@fitmyoutfit/editor/design`)

- `createDesign(product)`: empty design, every zone at its default colour.
- `validateDesign(input, { product? })`: returns `{ ok: true, value }` or `{ ok: false, errors: [{ path, message }] }`. Never throws. With `product`, it also checks that zones and pattern pieces exist. Rules that need several parts of the document (unique ids, `fontId` listed in `fonts`) run only after the structure is valid.
- `validateProductDefinition(input)`, `assertValidDesign(input)`.
- Edits, all immutable (they return a new document, never change the input, and throw `DesignError` with readable messages for invalid input): `setZoneColor`, `addLayer`, `updateLayer`, `removeLayer`, `addFont`. `updateLayer` replaces nested objects (`position`, `size`) whole and cannot change `id` or `kind`.
- `getDesignJsonSchema()`, `getProductJsonSchema()`.

## Product definitions are data

A product definition (`samples/products/placeholder-jersey.json`, schema in `schema/product.schema.json`) lists the model file, the pattern pieces (id, name, mesh name, size in mm, UV rectangle), the colour zones (id, name, the model's material names it colours, default colour) and the palette. A real model replaces the placeholder by changing this JSON and the GLB file; no code changes. The component colours a zone by setting the colour of the materials the zone lists.

## Placeholder model

`samples/models/placeholder-jersey.glb` (about 90 KB) is generated by `scripts/generate-placeholder-jersey.mjs` with `@gltf-transform/core`: procedural geometry, no third-party model or texture, so there is nothing to attribute. The script reads mesh names, material names and UV rectangles from the product definition, and tests check the GLB and the definition agree.

## Deliberately left for later

- Mapping SVG pattern panels onto the model as textures, and showing text, number and logo layers on the model (weeks 3 to 8).
- Palette data, snapping a custom HEX to the nearest palette colour and its warning, templates, undo and redo.
- Upload checks (file type, resolution, DPI), real font files and font metrics, text fitting.
- Roster data and number or name binding for team orders; proof renders.
- Migrations between `schemaVersion`s (only version 1 exists; other versions are rejected with a clear message).
- Checks that layers lie inside their piece, mirrored or rotated pieces in UV space, per-layer visibility or locking.
- Saving, design versions ("every save creates a new version") and share links: backend concerns. `schemaVersion` is the format version only.
- Compression of the model (Draco or Meshopt) and performance tuning for mid-range phones. The component renders on demand (`frameloop="demand"`) and caps the pixel ratio at 2, but no phone measurements have been made.
