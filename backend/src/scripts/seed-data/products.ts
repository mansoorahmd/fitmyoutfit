import type { PlaceholderData, ProductImagesSeed, ProductSeed } from "./types"

/**
 * PLACEHOLDER IMAGES, for local development only.
 * Stand-in photos from spized.com (founder's direction, 10 Nov 2026), as listed under "Product
 * images" in docs/contracts/sprint-0-dev-setup.md. They belong to another store and carry its
 * logo: they must be replaced by our own product photos before anything is deployed where the
 * public can see it. Only the links are kept here; no file is copied into the repo.
 */
const SPIZED_THUMBNAILS = "https://www.spized.com/thumbnail/"

function spizedImages(...paths: string[]): ProductImagesSeed {
  return { placeholder: true, urls: paths.map((path) => `${SPIZED_THUMBNAILS}${path}`) }
}

/** Medusa's public demo photo, kept for the rush add-on (it is not shown in any listing). */
const MEDUSA_DEMO_IMAGES = "https://medusa-public-images.s3.eu-west-1.amazonaws.com/"

/**
 * PLACEHOLDER DATA: launch products and their copy.
 * Real input: final product names and descriptions (product lead). Prices are in prices.ts (for
 * products with has_fixed_prices: true), sizes in sizes.ts.
 * Images: web URLs, placeholders (see above); real input is our own product photos, uploaded in
 * the admin or listed here as URLs. The seed sets them only on a product with no picture yet.
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
      images: spizedImages(
        "4b/cb/26/1744736603/abc184bc-ffaa-6972-d8f4-67ad4c530dd0_784006_600x600.webp?ts=1793783716",
        "5a/6f/9d/1744736603/99ed42a2-57cd-9912-8d85-67c407751689_784006_600x600.webp?ts=1793799289"
      ),
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
      images: spizedImages(
        "ec/18/b3/1752243175/e3ad4da2-a889-3963-c6e8-f7a0582cff6f_781001-V2_600x600.png?ts=1752243175",
        "18/c3/8b/1744797261/custom-football-jersey-red-white-chevron-pattern_600x600.webp?ts=1794311519"
      ),
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
      images: spizedImages(
        "e9/e8/b6/1698000660/trainingsanzugjacke-herren-premium1-3_470x580.jpg?ts=1745265681",
        "0c/9e/d4/1701168696/trainingsjacke-damen-premium1-1_470x580.jpg?ts=1745265645"
      ),
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
      images: spizedImages(
        "74/0b/41/1731488347/fussball-trikot-herren-kurzarm-basic1-1_%281%29_470x580.jpg?ts=1745265613",
        "de/c0/3c/1731488347/fussball-trikot-herren-kurzarm-basic2-2_%281%29_320x400.jpg?ts=1745265613"
      ),
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
      images: { placeholder: true, urls: [`${MEDUSA_DEMO_IMAGES}shorts-vintage-front.png`] },
      // Rush is a percentage of the order (settings.ts), so this product has no fixed price.
      has_fixed_prices: false,
    },
  ],
}
