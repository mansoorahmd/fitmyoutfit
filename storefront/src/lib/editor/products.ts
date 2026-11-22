// PLACEHOLDER: which product has which 3D model, in one place. Replace this
// file with product data (a field of the Medusa product) when the real
// models arrive. Until then the handles of the seeded products are matched
// here, and only the jersey and the T-shirt have a model; the jacket and the
// fit kit have none, so they get no designer.
//
// The jersey is our own match jersey (V-neck, with the person under it: the
// editor's `match-jersey-vneck` and its `body-male` model). Its person is a
// development stand-in whose terms for public use are not checked (the editor's
// README, "Match jerseys and the body"): no credit line is shown for it, and it
// must be cleared before the store goes public. The T-shirt is still the
// open-licence stand-in and keeps its credit line.
//
// The files themselves stay in packages/editor/samples/ (one source of
// truth). The storefront serves them through /api/editor-assets/ (see
// ./asset-path.ts and app/api/editor-assets), it keeps no copy.

export type ModelCredit = {
  title: string
  author: string
  sourceUrl: string
  licence: string
  licenceUrl: string
  /** Whether we changed the model (CC BY asks us to say so). */
  changed: boolean
}

export type EditorProduct = {
  /** The Medusa product's handle. */
  handle: string
  /** The editor's product definition: samples/products/<definition>.json, whose `id` the saved design is kept under. */
  definition: string
  /** The model file in samples/models/, as the definition's `model.url` names it. */
  modelFile: string
  /** The garment's short name in the editor's top bar. */
  shortName: string
  /** The body model shown under the garment (samples/models), when the product has one. */
  bodyFile?: string
  /** What the model's licence asks to show, wherever the model is shown; null when our own model needs none. */
  credit: ModelCredit | null
}

/**
 * Editor products the store used to open for a store product and does not any more. A design saved for one of
 * them belongs to another editor product than the one the designer opens now: it is not opened (it would not
 * fit), and the customer is told. The key is the old editor product id, the value the store product's handle.
 */
export const EARLIER_MODELS: Readonly<Record<string, string>> = {
  "stand-in-jersey": "jersey",
}

const EDITOR_PRODUCTS: readonly EditorProduct[] = [
  {
    handle: "jersey",
    definition: "match-jersey-vneck",
    modelFile: "match-jersey-vneck.glb",
    bodyFile: "body-male.glb",
    shortName: "Jersey",
    credit: null,
  },
  {
    handle: "t-shirt",
    definition: "stand-in-tshirt",
    modelFile: "stand-in-tshirt.glb",
    shortName: "T-shirt",
    credit: {
      title: "Garment 3D",
      author: "Prashant Verma",
      sourceUrl: "https://github.com/prashant3285/garment",
      licence: "MIT",
      licenceUrl: "https://opensource.org/license/mit",
      changed: true,
    },
  },
]

/** The designer's data for a product handle, or null when the product has no 3D model. */
export function editorProductFor(handle: string | undefined | null): EditorProduct | null {
  if (!handle) return null
  return EDITOR_PRODUCTS.find((p) => p.handle === handle) ?? null
}

/** The handles that have a model. */
export function editorHandles(): string[] {
  return EDITOR_PRODUCTS.map((p) => p.handle)
}

/** Whether a design (any JSON) was made for an editor product the store no longer opens for this handle. */
export function isEarlierModelDesign(design: unknown, entry: Pick<EditorProduct, "handle" | "definition">): boolean {
  if (typeof design !== "object" || design === null) return false
  const product = (design as { product?: unknown }).product
  const id = typeof product === "object" && product !== null ? (product as { id?: unknown }).id : undefined
  return typeof id === "string" && id !== entry.definition && EARLIER_MODELS[id] === entry.handle
}

/** The old editor product ids of a store product (the keys the device may still hold a design under). */
export function earlierModelIds(handle: string): string[] {
  return Object.entries(EARLIER_MODELS).flatMap(([id, h]) => (h === handle ? [id] : []))
}
