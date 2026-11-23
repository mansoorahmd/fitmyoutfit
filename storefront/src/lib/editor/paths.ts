// The designer's addresses, without the country code (the localized link
// adds it) and with it (for router.push, which does not).

/** The designer page of a product: /design/jersey. With a garment (an editor product id): /design/jersey?garment=match-jersey-round. */
export const designPath = (handle: string, garmentId?: string): string =>
  garmentId ? `/design/${handle}?garment=${encodeURIComponent(garmentId)}` : `/design/${handle}`

/**
 * Where the designer returns to: the product page of the same country.
 * After "Done" the address carries ?design=saved, which shows the notice;
 * the close button returns without it.
 */
export function productReturnPath(
  countryCode: string,
  handle: string,
  options: { saved: boolean }
): string {
  const base = `/${countryCode}/products/${handle}`
  return options.saved ? `${base}?design=saved` : base
}
