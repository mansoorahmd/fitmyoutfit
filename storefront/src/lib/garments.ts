/**
 * Handle of the product collection that the main listings (home page and
 * store page) show. The backend seed puts the three garments in it; the
 * extras (fit kit, rush add-on) stay out. The fit kit's product page still
 * works; the rush add-on has none (lib/util/product-kind.ts).
 * See docs/contracts/sprint-0-dev-setup.md.
 */
export const GARMENTS_COLLECTION_HANDLE = "garments"
