// PLACEHOLDER: which product has which 3D model, in one place. Replace this
// file with product data (a field of the Medusa product) when the real
// models arrive. Until then the handles of the seeded products are matched
// here, and only the jersey and the T-shirt have a model; the jacket and the
// fit kit have none, so they get no designer.
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
  /** What the model's licence asks to show, wherever the model is shown. */
  credit: ModelCredit
}

const EDITOR_PRODUCTS: readonly EditorProduct[] = [
  {
    handle: "jersey",
    definition: "stand-in-jersey",
    modelFile: "stand-in-jersey.glb",
    shortName: "Jersey",
    credit: {
      title: "Jersey Patterns 3D Free",
      author: "Wearable3D",
      sourceUrl:
        "https://sketchfab.com/3d-models/jersey-patterns-3d-free-a6b7401510484ee1b375c02f97f14e86",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      changed: true,
    },
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
