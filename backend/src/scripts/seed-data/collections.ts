import type { CollectionSeed, PlaceholderData } from "./types"

/**
 * PLACEHOLDER DATA: product collections.
 * The storefront's product listings show the `garments` collection only, so the fit kit and the
 * rush add-on (which belong to no collection) stay out of the main grid.
 */
export const collections: PlaceholderData<CollectionSeed[]> = {
  placeholder: true,
  note: "One collection for the three launch garments.",
  data: [{ title: "Garments", handle: "garments" }],
}
