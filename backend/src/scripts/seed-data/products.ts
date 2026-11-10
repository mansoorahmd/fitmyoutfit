import type { PlaceholderData, ProductSeed } from "./types"

/**
 * PLACEHOLDER DATA: launch products and their copy.
 * Real input: final product names and descriptions (product lead). Prices are in prices.ts (for
 * products with has_fixed_prices: true), sizes in sizes.ts.
 * Images: `image` names a file in ./images/. Those files are PLACEHOLDER drawings made by
 * backend/scripts/generate-placeholder-images.mjs; real input is product photos.
 * All products are made to order, so inventory is not managed.
 */
export const products: PlaceholderData<ProductSeed[]> = {
  placeholder: true,
  note: "Three launch garments plus the two extras. Descriptions and images are placeholders.",
  data: [
    {
      handle: "jersey",
      title: "Jersey",
      description: "Custom team jersey, made to order. Placeholder description.",
      kind: "garment",
      collection_handle: "garments",
      has_sizes: true,
      sku_prefix: "JERSEY",
      image: "jersey.png",
      has_fixed_prices: true,
    },
    {
      handle: "t-shirt",
      title: "T-Shirt",
      description: "Custom T-shirt, made to order. Placeholder description.",
      kind: "garment",
      collection_handle: "garments",
      has_sizes: true,
      sku_prefix: "TSHIRT",
      image: "t-shirt.png",
      has_fixed_prices: true,
    },
    {
      handle: "jacket",
      title: "Jacket",
      description: "Custom jacket, made to order. Placeholder description.",
      kind: "garment",
      collection_handle: "garments",
      has_sizes: true,
      sku_prefix: "JACKET",
      image: "jacket.png",
      has_fixed_prices: true,
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
      image: "fit-kit.png",
      has_fixed_prices: true,
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
      image: "rush-add-on.png",
      // Rush is a percentage of the order (settings.ts), so this product has no fixed price.
      has_fixed_prices: false,
    },
  ],
}
