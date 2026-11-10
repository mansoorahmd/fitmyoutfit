# @fitmyoutfit/editor

The 3D design editor for the store. It is a standalone React + Three.js package: no Medusa, no Next.js. The storefront embeds it; a future platform could reuse it.

**A design is data, not an image.** A design is a versioned JSON document. Previews, proof renders and production files are all generated from it, so it never holds flattened pixels.

Status: foundation only (Sprint 0). The document format below is a **first draft** (`schemaVersion` 1) that the week 3 to 12 work will extend.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Demo page at http://localhost:5173 (this computer only) |
| `npm run dev:lan` | The same, but also reachable from other devices on your network, for example a phone on the same Wi-Fi. Opt-in, because it exposes the dev server |
| `npm run build` | Library build to `dist/` (ES modules, a CommonJS build of the `design` entry, and `.d.ts` files), then checks the entry points, including real consumer projects (see below) |
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

Two kinds of consumer, both supported:

- **The root entry (`@fitmyoutfit/editor`, the React component)** is ES module only and is meant for bundlers: Next.js and Vite. In Next.js, render `DesignCanvas` from a client component. Nothing in the package touches `window` or `document` when imported, so importing it on the server is safe.
- **The `/design` entry** works from **both ES modules and CommonJS**, with TypeScript `"moduleResolution": "Node16"`, `"NodeNext"` or `"Bundler"`. The Medusa backend (a CommonJS project on Node16 resolution) can `require("@fitmyoutfit/editor/design")` or `import` it, on Node 20 and 22, and get correct types.

How that works, because it is easy to break: `exports["./design"]` has an `import` branch (`dist/design.js`, declarations in `dist/types/`) and a `require` branch (`dist/cjs/design.cjs`, declarations in `dist/cjs/types/`). The package is `"type": "module"`, so TypeScript reads every `.d.ts` in it as an ES module and rejects it from a CommonJS file. `dist/cjs/package.json` (`{"type": "commonjs"}`) makes the CommonJS copy of the declarations read as CommonJS. Relative imports in the source carry a `.js` extension (`from "./schema.js"`) so the emitted declarations resolve under Node16. Keep writing them that way.

`npm run build` ends with `scripts/check-entrypoints.mjs`. It packs the package as it would be published and installs it into a throw-away project (under `node_modules/.cache/`), then checks:

- a CommonJS project with `"module": "Node16"` type-checks an import of `createDesign`, `validateDesign` and `DesignDocument`, compiles it and runs it; and a plain `require()` of the entry;
- an ES module project with `"module": "NodeNext"` does the same;
- a `Bundler` project type-checks both entries.

It runs on the Node version that runs the build. To check Node 20, run the build or `node scripts/check-entrypoints.mjs` under Node 20. A regression in `exports`, in the declarations or in the CommonJS build fails the build.

### Peer dependencies

`react` and `react-dom` are peer dependencies at `^19.0.0` (React 18 is not supported). `three` is `>=0.170.0`. `@react-three/fiber`, `@react-three/drei` and `zod` are normal dependencies.

Heads-up: `@react-three/fiber` 9 itself declares `react >=19 <19.4`. Our own range is wider (`^19.0.0`), so when React 19.4 or later is released, npm will print a peer-dependency warning from `@react-three/fiber`, not from this package. That is expected: either wait for a `@react-three/fiber` release that widens the range, or pin React to 19.3.x in the app. Re-check this when upgrading React.

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

- A `text` value is any Unicode text of 1 to 200 characters and is stored exactly as written: Latin, Arabic and Urdu names, mixed text such as `Ali علي 10`, and combining marks are all accepted. There is no normalisation, so `e` plus a combining acute and the single character `é` stay different values. (Text direction, alignment by reading direction and font fallback per script belong to the text-layer work in weeks 5 to 6.)
- A `number` value is a jersey number: see "Jersey numbers" below. In short, a string of 1 or 2 digits worth 0 to 99, in English, Arabic or Urdu digits, one system per number, stored exactly as typed (`"7"`, `"07"`, `"٧"`).
- `rotation` is any finite number of degrees. It is stored as given, not wrapped to 0 to 360 (`725.5` stays `725.5`). A value that is not a finite number is rejected.
- `position` may lie outside the piece (negative, or beyond the piece size) and is accepted. Checking that layers stay inside their piece is not done yet (see "Deliberately left for later").

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
- `validateDesign(input, { product? })`: returns `{ ok: true, value }` or `{ ok: false, errors: [{ path, message }] }`. **Never throws**: a value that cannot even be read (a throwing getter, a Proxy that throws) comes back as one error with an empty `path` and the message `a design could not be read (<reason>)`. With `product`, it also checks that zones and pattern pieces exist. Rules that need several parts of the document (unique ids, `fontId` listed in `fonts`) run only after the structure is valid.
- `validateProductDefinition(input)` (also never throws), `assertValidDesign(input)`.
- Edits, all immutable (they return a new document, never change the input, and throw `DesignError`, never a raw `TypeError`, with readable messages for invalid input, including a wrong argument such as `undefined` or `null`): `setZoneColor`, `addLayer`, `updateLayer`, `removeLayer`, `addFont`. `updateLayer` replaces nested objects (`position`, `size`) whole and cannot change `id` or `kind`.
  - A text or number layer must use a font listed in `design.fonts`: `addLayer` and `updateLayer` refuse an unknown `fontId`. Add the font first with `addFont`.
  - A number layer's value must follow the jersey number rule (below), in `validateDesign` and in `addLayer` and `updateLayer`, with the same readable message. Pass `{ jerseyNumberRules }` (next to `{ product }`) to use other rules than the default data.
  - Pass `{ product }` as the last argument (`addLayer(design, layer, { product })`, `updateLayer(design, id, patch, { product })`, `setZoneColor(design, zone, colour, { product })`) to also refuse a `pieceId` or zone that the product does not have, or a product that is not the one the design is for. Without it only the document is checked, because the document does not carry the product's pieces.
  - **Fonts that no layer uses any more stay in `fonts`** after `removeLayer` or after a layer switches font. They are harmless, the next layer can reuse them, and nothing removes data behind the caller's back. A later "tidy up" step (for example when saving) can drop them.
- A zone id may not be `__proto__`, `constructor` or `prototype`, and a `__proto__` key in a JSON document is a validation error rather than being dropped silently.
- `getDesignJsonSchema()`, `getProductJsonSchema()`.

## Jersey numbers

The founders' rule (S0-3c), held as data and applied by one set of plain functions. The backend's roster checks use the same functions, so a number is judged the same way in the editor and at order time.

- A jersey number is a string of digits worth **0 to 99**. The longest allowed string follows from the maximum: **2 digits**, counting leading zeros, so `"007"` is invalid.
- Allowed digit systems: Western `0-9` (U+0030 to U+0039), Arabic-Indic `٠-٩` (U+0660 to U+0669) and Extended Arabic-Indic `۰-۹` (U+06F0 to U+06F9, the Urdu and Persian forms). **One number may not mix systems** (`"1٢"`, and `"٧۷"`, are invalid).
- Leading zeros are allowed and do not change the value: `"07"` and `"7"` are both 7. The string is kept exactly as typed; digits are never converted to another system.
- **The same number:** two numbers are the same when their values are equal, in any digit system and with or without leading zeros: `"7"`, `"07"`, `"٧"` and `"۷"`.
- Nothing else: no signs, spaces, decimal points, full-width digits (`"７"`). Nothing is trimmed or normalised: `" 7"` is invalid. Empty is invalid.

**The limits are data.** They live in `src/design/jersey-number-rules.ts` as `DEFAULT_JERSEY_NUMBER_RULES` (`{ maxValue: 99, digitSystems: [...] }`, each system being an id, a name and the code point of its zero). Every function below takes `rules` as an optional last argument and defaults to that data, so the backend can pass rules loaded from its own settings without a code change here. `checkJerseyNumberRules(rules)` returns a description of what is wrong with a rules object (or `null`); an unusable rules object makes the functions throw a `RangeError`.

```ts
import {
  checkJerseyNumber, jerseyNumberValue, isSameJerseyNumber, findDuplicateJerseyNumbers,
} from "@fitmyoutfit/editor/design"; // also from "@fitmyoutfit/editor"; no React or Three.js

checkJerseyNumber("٠٧");   // { ok: true, value: 7, digitSystem: "arabic-indic" }
checkJerseyNumber("100");  // { ok: false, error: '"100" has more than 2 digits (the largest jersey number is 99; leading zeros count)' }
checkJerseyNumber("1٢");   // { ok: false, error: '"1٢" mixes two digit systems (Western (0-9) and Arabic-Indic (٠-٩)); use one system only' }
jerseyNumberValue("07");   // 7  (null when invalid)
isSameJerseyNumber("7", "۷"); // true

// Roster check: one call over every player's number, as typed.
const { duplicates, invalid } = findDuplicateJerseyNumbers(players.map((p) => p.number));
// duplicates: [{ value: 7, indexes: [0, 3], numbers: ["7", "٧"] }]  (sorted by value; indexes are list positions)
// invalid:    [{ index: 5, entry: "100", error: "..." }]
```

- `checkJerseyNumber(input: unknown, rules?)` returns `{ ok: true, value, digitSystem }` or `{ ok: false, error }`. It accepts any input and never throws for a bad number; `error` is a readable phrase that starts with the quoted number (or says what type it got).
- `isValidJerseyNumber(input, rules?)`, `jerseyNumberValue(input, rules?)` (the value, or `null` when invalid), `jerseyNumberMaxLength(rules?)`.
- `isSameJerseyNumber(a, b, rules?)`: true only when both are valid and their values are equal. An invalid entry is never "the same" as anything.
- `findDuplicateJerseyNumbers(list, rules?)` returns `{ duplicates, invalid }`. **Invalid entries never crash it and never count as duplicates**, not even two identical invalid strings: they are listed in `invalid` (index, entry, reason) so the caller can show both problems. Without a list it throws a `TypeError`.
- The error wording may be improved over time. Test on `ok`, not on the text, in the backend.

### How the JSON Schema and the validation function divide the work

A JSON Schema cannot say "at most N" where N is data, so `schema/design.schema.json` checks the **structure** of a number layer's value only: one or more digits, all from one of the three digit systems (that pattern also rules out mixing). **The maximum (99) and the length that follows from it are enforced by `validateDesign` and the edit functions**, with the rules you pass in. This is stated in the schema's `description` for the value. So a document can pass the schema and still be rejected by `validateDesign` (`"100"`); never the other way round. Treat `validateDesign` as the rule and the schema as a structural pre-check for other tools. A test (`json-schema.test.ts`) lists exactly where the two differ.

Limit of "rules as data": rules can change the maximum or allow fewer digit systems. A digit system that is not one of the three in the default data is still refused by the schema's pattern, which is built from the default data. Adding a fourth system means adding it to the default data and regenerating the schema.

## Product definitions are data

A product definition (`samples/products/placeholder-jersey.json`, schema in `schema/product.schema.json`) lists the model file, the pattern pieces (id, name, mesh name, size in mm, UV rectangle), the colour zones (id, name, the model's material names it colours, default colour) and the palette. A real model replaces the placeholder by changing this JSON and the GLB file; no code changes. The component colours a zone by setting the colour of the materials the zone lists.

## Placeholder model

`samples/models/placeholder-jersey.glb` (about 90 KB) is generated by `scripts/generate-placeholder-jersey.mjs` with `@gltf-transform/core`: procedural geometry, no third-party model or texture, so there is nothing to attribute. The script reads mesh names, material names and UV rectangles from the product definition, and tests check the GLB and the definition agree.

## Deliberately left for later

- Mapping SVG pattern panels onto the model as textures, and showing text, number and logo layers on the model (weeks 3 to 8).
- Palette data, snapping a custom HEX to the nearest palette colour and its warning, templates, undo and redo.
- Upload checks (file type, resolution, DPI), real font files and font metrics, text fitting.
- Roster data and number or name binding for team orders; proof renders. (The number rule and the duplicate check exist as plain functions; the roster itself does not.)
- Migrations between `schemaVersion`s (only version 1 exists; other versions are rejected with a clear message).
- Checks that layers lie inside their piece (today a layer may sit partly or wholly outside it), mirrored or rotated pieces in UV space, per-layer visibility or locking.
- Saving, design versions ("every save creates a new version") and share links: backend concerns. `schemaVersion` is the format version only.
- Compression of the model (Draco or Meshopt) and performance tuning for mid-range phones. The component renders on demand (`frameloop="demand"`) and caps the pixel ratio at 2, but no phone measurements have been made.
