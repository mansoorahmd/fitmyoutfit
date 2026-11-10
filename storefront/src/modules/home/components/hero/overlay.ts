// The navy layer between the hero image and its text. Plain data, so a unit
// test can check the contrast it guarantees (src/__tests__/hero-overlay.test.ts).
//
// The text must reach 4.5:1 whatever the photo shows, so the test assumes
// the worst case: a pure white pixel behind the text. Navy at 80% over white
// still gives white text about 9.6:1 and the muted subline about 5.2:1.
//
// Below 1280 px the text spans the width, so the layer is even. From 1280 px
// the text sits in the left half: the layer is at least 80% over the left
// 55% and fades to 30% on the right, so more of the kit shows.

/** The lowest opacity of the layer anywhere text can sit. */
export const HERO_OVERLAY_TEXT_ALPHA = 0.8

/** How far across (from the left) the layer stays at the text alpha from 1280 px. */
export const HERO_OVERLAY_TEXT_STOP_PERCENT = 55

/** Classes of the layer. The test reads the alphas out of these. */
export const heroOverlayClasses =
  "absolute inset-0 bg-brand-inverse/80 " +
  "xl:bg-transparent xl:bg-gradient-to-r " +
  "xl:from-brand-inverse/90 xl:from-0% " +
  "xl:via-brand-inverse/80 xl:via-55% " +
  "xl:to-brand-inverse/30 xl:to-100%"

/** The text block's widest size from 1280 px; it must end before the stop. */
export const heroTextMaxWidthClass = "xl:max-w-[600px]"
