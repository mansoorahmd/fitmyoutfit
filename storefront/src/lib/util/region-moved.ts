// The notice after the storefront moved a cart to another region (QA S1-4,
// D10 and D15): the cart page or checkout was opened under another
// country's address, or the region was changed in another tab before
// "Place order". The move happens in the browser (MoveCartToRegion), the
// page then loads again, and the page the customer lands on says once what
// changed. The note between the two lives in sessionStorage: this tab only,
// read once, and only by a page of the country the cart moved to.

export const REGION_MOVED_KEY = "fmo-region-moved"

/** A note older than this is stale (the page never loaded): it is dropped, not shown. */
export const REGION_MOVED_MAX_AGE_MS = 5 * 60_000

export type RegionMovedNote = { countryCode: string; at: number }

/** The note to keep when a cart has moved to `countryCode`. */
export const regionMovedNote = (countryCode: string, now: number): string =>
  JSON.stringify({ countryCode: countryCode.toLowerCase(), at: now } satisfies RegionMovedNote)

/**
 * Whether the page of `countryCode` shows the notice, from the kept note.
 * The caller removes the note either way once read, so it shows once.
 */
export const showsRegionMoved = (
  stored: string | null | undefined,
  countryCode: string,
  now: number
): boolean => {
  if (!stored) return false
  try {
    const note = JSON.parse(stored) as Partial<RegionMovedNote>
    return (
      typeof note.countryCode === "string" &&
      note.countryCode === countryCode.toLowerCase() &&
      typeof note.at === "number" &&
      now - note.at >= 0 &&
      now - note.at <= REGION_MOVED_MAX_AGE_MS
    )
  } catch {
    return false
  }
}
