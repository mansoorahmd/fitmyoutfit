// Pure index logic for the product image gallery. Positions are 0-based
// internally; every label shown to the customer is 1-based.

/** Keep an index inside 0..count-1. With no items the index is 0. */
export const clampIndex = (index: number, count: number): number => {
  if (count <= 0 || !Number.isFinite(index)) {
    return 0
  }
  return Math.min(Math.max(Math.trunc(index), 0), count - 1)
}

/** The next index, or the same one at the end. Never wraps. */
export const nextIndex = (index: number, count: number): number =>
  clampIndex(index + 1, count)

/** The previous index, or the same one at the start. Never wraps. */
export const previousIndex = (index: number, count: number): number =>
  clampIndex(index - 1, count)

export const canGoNext = (index: number, count: number): boolean =>
  count > 0 && clampIndex(index, count) < count - 1

export const canGoPrevious = (index: number, count: number): boolean =>
  count > 0 && clampIndex(index, count) > 0

/** "Image 2 of 4": the announced current position. */
export const positionLabel = (index: number, count: number): string =>
  `Image ${clampIndex(index, count) + 1} of ${count}`

/** "Show image 2 of 4": the accessible name of a dot or thumbnail. */
export const showImageLabel = (index: number, count: number): string =>
  `Show image ${index + 1} of ${count}`

/** "{title}, image 2 of 4": the alt text of an image. */
export const imageAlt = (title: string, index: number, count: number): string =>
  `${title}, image ${index + 1} of ${count}`

/**
 * Which slide a scrolling container is showing, from its scroll position and
 * the width of one slide. Rounds to the nearest slide.
 */
export const indexFromScroll = (
  scrollLeft: number,
  slideWidth: number,
  count: number
): number => {
  if (slideWidth <= 0) {
    return 0
  }
  return clampIndex(Math.round(scrollLeft / slideWidth), count)
}
