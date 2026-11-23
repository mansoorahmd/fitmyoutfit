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

/**
 * One garment the editor offers inside a store product: the jersey has two (its necks), the T-shirt one. They are
 * the same store product, price and sizes; only the editor's product definition and model differ.
 */
export type EditorGarment = {
  /** The editor's product definition: samples/products/<definition>.json, whose `id` the saved design is kept under. */
  definition: string
  /** The model file in samples/models/, as the definition's `model.url` names it. */
  modelFile: string
  /** The garment's name in the chooser and in sentences: "Jersey, V-neck". */
  name: string
  /** The chip's words inside a group ("V-neck"); absent for a garment with one shape. */
  variant?: string
  /** The shape in a sentence after the product's name ("V-neck", "round neck"); absent for a garment with one shape. */
  phrase?: string
  /** A small picture in samples/pictures/ (a .png) for the editor's garment chooser, when the editor has one. */
  picture?: string
  /**
   * The garment's own front picture for the store's chooser card (/design), in samples/pictures/products/ (a .webp,
   * rendered from our 3D model). Absent: the card shows the Medusa product's thumbnail.
   */
  productPicture?: string
}

export type EditorProduct = {
  /** The Medusa product's handle. */
  handle: string
  /** The editor's product definition of the product's first garment (its V-neck, for the jersey). */
  definition: string
  /** The first garment's model file in samples/models/, as the definition's `model.url` names it. */
  modelFile: string
  /** The product's garments, the first being the one a new design opens on. One entry: nothing to choose inside the product. */
  garments: readonly EditorGarment[]
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
    garments: [
      {
        definition: "match-jersey-vneck",
        modelFile: "match-jersey-vneck.glb",
        name: "Jersey, V-neck",
        variant: "V-neck",
        phrase: "V-neck",
        picture: "pictures/match-jersey-vneck.png",
        productPicture: "pictures/products/jersey-vneck-front.webp",
      },
      {
        definition: "match-jersey-round",
        modelFile: "match-jersey-round.glb",
        name: "Jersey, round neck",
        variant: "Round neck",
        phrase: "round neck",
        picture: "pictures/match-jersey-round.png",
        productPicture: "pictures/products/jersey-round-front.webp",
      },
    ],
    bodyFile: "body-male.glb",
    shortName: "Jersey",
    credit: null,
  },
  {
    handle: "t-shirt",
    definition: "stand-in-tshirt",
    modelFile: "stand-in-tshirt.glb",
    garments: [
      {
        definition: "stand-in-tshirt",
        modelFile: "stand-in-tshirt.glb",
        name: "T-shirt",
        productPicture: "pictures/products/tshirt-front.webp",
      },
    ],
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

// ---- the garments inside a product, and the garment chooser's list ----------------------------------------

/** The product's garment for an editor product id (what a saved design names), or null when it is none of them. */
export function garmentById(entry: Pick<EditorProduct, "garments">, id: string | null | undefined): EditorGarment | null {
  return (id ? entry.garments.find((g) => g.definition === id) : null) ?? null
}

/** The editor product id a design (any JSON) was made for, or null. */
export function designProductId(design: unknown): string | null {
  if (typeof design !== "object" || design === null) return null
  const product = (design as { product?: unknown }).product
  const id = typeof product === "object" && product !== null ? (product as { id?: unknown }).id : undefined
  return typeof id === "string" ? id : null
}

/**
 * The garment (the neck) a saved design opens on: the one it was made for, when the product has it; otherwise the
 * product's first garment (a design for an earlier model is not opened at all, see `isEarlierModelDesign`).
 */
export function garmentOfDesign(entry: Pick<EditorProduct, "garments">, design: unknown): EditorGarment {
  return garmentById(entry, designProductId(design)) ?? entry.garments[0]!
}

/**
 * The product's name where the shape matters ("Jersey, round neck": the roster proof's header, the factory makes what it
 * shows). A product with one shape keeps the name as it is.
 */
export function garmentTitle(title: string, garment: Pick<EditorGarment, "phrase">): string {
  return garment.phrase && title.trim() !== "" ? `${title}, ${garment.phrase}` : title
}

/** The chooser's choice for one garment, as the editor's `garments` prop wants it (the definition is added by the designer). */
export type GarmentListEntry = {
  id: string
  name: string
  group?: string
  groupName?: string
  variant?: string
  picture?: string
  /** The store product's handle: where choosing this garment leads when it is another product. */
  handle: string
}

/**
 * The garments the designer's chooser lists. Outside a team order: every garment of every product, the jersey's
 * necks as one group. Inside a team order the order is for one product (the backend refuses another product's design
 * version): only that product's own garments, and none at all when it has just one (nothing to choose).
 */
export function garmentList(current: Pick<EditorProduct, "handle">, options: { inOrder: boolean }): GarmentListEntry[] {
  const products = options.inOrder ? EDITOR_PRODUCTS.filter((p) => p.handle === current.handle) : EDITOR_PRODUCTS
  const entries = products.flatMap((p) =>
    p.garments.map(
      (g): GarmentListEntry => ({
        id: g.definition,
        name: g.name,
        ...(p.garments.length > 1 ? { group: p.handle, groupName: p.shortName, ...(g.variant ? { variant: g.variant } : {}) } : {}),
        ...(g.picture ? { picture: g.picture } : {}),
        handle: p.handle,
      })
    )
  )
  return options.inOrder && entries.length < 2 ? [] : entries
}

/** The store product that owns an editor product id, or null. */
export function entryOfGarment(id: string): EditorProduct | null {
  return EDITOR_PRODUCTS.find((p) => p.garments.some((g) => g.definition === id)) ?? null
}
