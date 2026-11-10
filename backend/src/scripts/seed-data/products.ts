import type { PlaceholderData, ProductImagesSeed, ProductSeed } from "./types"

/**
 * Medusa's public demo product photos, from a host the storefront already allows.
 * PLACEHOLDER IMAGES for local development only: they are stand-ins that do not show our
 * garments, taken from another store's demo, and must not be used outside local development.
 */
const DEMO_IMAGES_BASE = "https://medusa-public-images.s3.eu-west-1.amazonaws.com/"

function demoImages(...files: string[]): ProductImagesSeed {
  return { placeholder: true, urls: files.map((file) => `${DEMO_IMAGES_BASE}${file}`) }
}

/**
 * PLACEHOLDER DATA: launch products and their copy.
 * Real input: final product names and descriptions (product lead). Prices are in prices.ts (for
 * products with has_fixed_prices: true), sizes in sizes.ts.
 * Images: web URLs, placeholders (see above); real input is product photos, uploaded in the
 * admin or listed here as URLs. The seed sets them only on a product with no picture yet.
 * All products are made to order, so inventory is not managed.
 * The order of this list is the store's default product order (jersey first).
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
      images: demoImages("ls-black-front.png", "ls-black-back.png"),
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
      images: demoImages("tee-black-front.png", "tee-black-back.png"),
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
      images: demoImages("sweatshirt-vintage-front.png", "sweatshirt-vintage-back.png"),
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
      images: demoImages("sweatpants-gray-front.png"),
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
      images: demoImages("shorts-vintage-front.png"),
      // Rush is a percentage of the order (settings.ts), so this product has no fixed price.
      has_fixed_prices: false,
    },
  ],
}
