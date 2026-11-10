// When the phone's sticky buy bar shows (docs/design/03-direction.md,
// "Sticky buy bar"): once the main button has scrolled out of view upwards,
// and never while the footer is on screen. Plain numbers in, so it can be
// tested without a browser. All positions are viewport pixels
// (getBoundingClientRect).

export type VerticalBox = { top: number; bottom: number }

export type StickyBarInput = {
  /** The main button's box, or null before it exists. */
  mainButton: VerticalBox | null
  /** The footer's top edge, or null when there is no footer. */
  footerTop: number | null
  /** The sticky header's bottom edge: anything above it is hidden. */
  headerBottom: number
  viewportHeight: number
}

/** The main button has gone up past the header, out of view. */
export const hasScrolledPast = (box: VerticalBox, headerBottom: number): boolean =>
  box.bottom <= headerBottom

/** Some of the footer is on screen. */
export const isFooterVisible = (
  footerTop: number | null,
  viewportHeight: number
): boolean => footerTop !== null && footerTop < viewportHeight

export const showStickyBuyBar = ({
  mainButton,
  footerTop,
  headerBottom,
  viewportHeight,
}: StickyBarInput): boolean =>
  mainButton !== null &&
  hasScrolledPast(mainButton, headerBottom) &&
  !isFooterVisible(footerTop, viewportHeight)

/**
 * Whether a box is wholly on screen between the header and the bottom of
 * the viewport. Used to decide whether the size group must be scrolled to.
 */
export const isFullyInView = (
  box: VerticalBox,
  headerBottom: number,
  viewportHeight: number
): boolean => box.top >= headerBottom && box.bottom <= viewportHeight

/**
 * What the customer has chosen, for the bar: "M", or "M / Navy" with
 * several options. Undefined until every option has a value, and for a
 * product with nothing to choose (its one variant is preselected, and
 * "Default option value" means nothing to a customer).
 */
export const chosenLabel = (
  options: { id: string }[] | null | undefined,
  selected: Record<string, string | undefined>,
  hasChoice: boolean
): string | undefined => {
  const list = options ?? []
  if (!hasChoice || list.length === 0) {
    return undefined
  }
  const values = list.map((option) => selected[option.id])
  return values.every(Boolean) ? values.join(" / ") : undefined
}

/**
 * The bar's summary on the left: "M · PKR 3,500" once a size is chosen, just
 * the price before. Empty when there is no price either.
 */
export const stickyBarSummary = (
  chosen: string | undefined,
  price: string | undefined
): string => [chosen, price].filter(Boolean).join(" · ")
