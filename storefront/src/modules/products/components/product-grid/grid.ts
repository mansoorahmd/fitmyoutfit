// The product grid's rules (docs/design/03-direction.md, "Product listing"),
// used by the listing, the home page's garments and "Complete the kit".
// Plain logic so it can be unit tested. The class names are written out in
// full here, inside src/modules, so Tailwind finds them.
//
// - Phones: 1 column while there are 3 products or fewer, 2 above that.
// - From 768 px: 3 columns.
// - From 1280 px: 3 columns, 4 when there are more than 6 products.
// - Gaps: 16, 24 and 32 px.

/** Up to this many products, a phone shows one card per row. */
export const ONE_COLUMN_MAX_PRODUCTS = 3

/** Above this many products, the grid has 4 columns from 1280 px. */
export const THREE_COLUMN_MAX_PRODUCTS = 6

/** "Sort by" is left out until there are more products than this. */
export const SORT_HIDDEN_MAX_PRODUCTS = 8

export const phoneColumns = (count: number): 1 | 2 =>
  count <= ONE_COLUMN_MAX_PRODUCTS ? 1 : 2

export const desktopColumns = (count: number): 3 | 4 =>
  count > THREE_COLUMN_MAX_PRODUCTS ? 4 : 3

export const showsSort = (count: number): boolean =>
  count > SORT_HIDDEN_MAX_PRODUCTS

const GAPS = "gap-4 md:gap-6 xl:gap-8"

export const productGridClasses = (count: number): string =>
  [
    "grid w-full",
    phoneColumns(count) === 1 ? "grid-cols-1" : "grid-cols-2",
    "md:grid-cols-3",
    desktopColumns(count) === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3",
    GAPS,
  ].join(" ")

/**
 * The `sizes` attribute for a card's image in such a grid, so phones do not
 * download desktop-sized photos.
 */
export const productCardImageSizes = (count: number): string =>
  [
    `(min-width: 1280px) ${desktopColumns(count) === 4 ? 300 : 400}px`,
    "(min-width: 768px) 33vw",
    phoneColumns(count) === 1 ? "100vw" : "50vw",
  ].join(", ")
