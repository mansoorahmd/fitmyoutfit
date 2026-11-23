import type { PlaceholderData, ProductImagesSeed, ProductSeed } from "./types"

/**
 * PLACEHOLDER IMAGES.
 * The jersey and the T-shirt have OUR OWN pictures, rendered from our 3D models and kept in
 * packages/editor/samples/pictures/products/ (named here in `files`, by file name). The seed
 * uploads them through Medusa's File Module (local files, or S3 / MinIO when the S3_* variables
 * are set) and uses the URLs that returns. They stay marked "placeholder": the pictures are
 * ours, but the design on them is a sample.
 * The jacket and the fit kit have no model yet, so they keep stand-in photos from spized.com
 * (founder's direction, 10 Nov 2026; see "Product images" in docs/contracts/sprint-0-dev-setup.md).
 * Those belong to another store and carry its logo: local development only, to be replaced
 * before anything is deployed where the public can see it. Only their links are kept here. The
 * jersey's and the T-shirt's `urls` are the OLD stand-ins: the seed replaces them with the files,
 * and only on a product that still shows exactly these (never a picture an admin changed).
 */
const SPIZED_THUMBNAILS = "https://www.spized.com/thumbnail/"

function spizedImages(paths: string[], files?: string[]): ProductImagesSeed {
  return {
    placeholder: true,
    urls: paths.map((path) => `${SPIZED_THUMBNAILS}${path}`),
    ...(files ? { files } : {}),
  }
}

/** Medusa's public demo photo, kept for the rush add-on (it is not shown in any listing). */
const MEDUSA_DEMO_IMAGES = "https://medusa-public-images.s3.eu-west-1.amazonaws.com/"

/**
 * PLACEHOLDER DATA: launch products and their copy.
 * Real input: final product names and descriptions (product lead). Prices are in prices.ts (for
 * products with has_fixed_prices: true), sizes in sizes.ts.
 * Images: our own pictures for the jersey and the T-shirt, stand-in web URLs for the rest (see
 * above). The seed sets them only on a product with no picture yet or one that still shows the
 * old stand-ins; a photo uploaded in the admin is never touched.
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
      // The jersey comes in two necks (one product, one price): V-neck then round neck.
      images: spizedImages(
        [
          "4b/cb/26/1744736603/abc184bc-ffaa-6972-d8f4-67ad4c530dd0_784006_600x600.webp?ts=1793783716",
          "5a/6f/9d/1744736603/99ed42a2-57cd-9912-8d85-67c407751689_784006_600x600.webp?ts=1793799289",
        ],
        [
          "jersey-vneck-front.webp",
          "jersey-vneck-back.webp",
          "jersey-round-front.webp",
          "jersey-round-back.webp",
        ]
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
        [
          "ec/18/b3/1752243175/e3ad4da2-a889-3963-c6e8-f7a0582cff6f_781001-V2_600x600.png?ts=1752243175",
          "18/c3/8b/1744797261/custom-football-jersey-red-white-chevron-pattern_600x600.webp?ts=1794311519",
        ],
        ["tshirt-front.webp", "tshirt-back.webp"]
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
      images: spizedImages([
        "e9/e8/b6/1698000660/trainingsanzugjacke-herren-premium1-3_470x580.jpg?ts=1745265681",
        "0c/9e/d4/1701168696/trainingsjacke-damen-premium1-1_470x580.jpg?ts=1745265645",
      ]),
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
      images: spizedImages([
        "74/0b/41/1731488347/fussball-trikot-herren-kurzarm-basic1-1_%281%29_470x580.jpg?ts=1745265613",
        "de/c0/3c/1731488347/fussball-trikot-herren-kurzarm-basic2-2_%281%29_320x400.jpg?ts=1745265613",
      ]),
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
