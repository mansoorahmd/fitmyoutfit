import type { PlaceholderData, ProductSeed } from "./types"

/**
 * PLACEHOLDER DATA: launch products and their copy.
 * Real input: final product names and descriptions (product lead). Prices are in prices.ts, sizes in sizes.ts.
 * All products are made to order, so inventory is not managed.
 */
export const products: PlaceholderData<ProductSeed[]> = {
  placeholder: true,
  note: "Three launch garments plus the two extras. Descriptions are placeholder text.",
  data: [
    {
      handle: "jersey",
      title: "Jersey",
      description: "Custom team jersey, made to order. Placeholder description.",
      kind: "garment",
      collection_handle: "garments",
      has_sizes: true,
      sku_prefix: "JERSEY",
    },
    {
      handle: "t-shirt",
      title: "T-Shirt",
      description: "Custom T-shirt, made to order. Placeholder description.",
      kind: "garment",
      collection_handle: "garments",
      has_sizes: true,
      sku_prefix: "TSHIRT",
    },
    {
      handle: "jacket",
      title: "Jacket",
      description: "Custom jacket, made to order. Placeholder description.",
      kind: "garment",
      collection_handle: "garments",
      has_sizes: true,
      sku_prefix: "JACKET",
    },
    {
      handle: "fit-kit",
      title: "Fit Kit",
      description:
        "A set of sample garments to try on before ordering. The price is a refundable deposit. Placeholder description.",
      kind: "fit_kit",
      collection_handle: null,
      has_sizes: false,
      sku_prefix: "FITKIT",
    },
    {
      handle: "rush-add-on",
      title: "Rush Production",
      description:
        "Add to a team order for 10-day delivery instead of 15 days. Placeholder description.",
      kind: "rush_add_on",
      collection_handle: null,
      has_sizes: false,
      sku_prefix: "RUSH",
    },
  ],
}
