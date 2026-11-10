// Class names for the product page's layout, kept apart so the rules can be
// tested without rendering the page. Breakpoints are Tailwind's defaults.

// From 768 px the gallery and the buy block are each at most 560 px wide
// and centred; from 1024 px they fill their grid columns instead.
const NARROW = "mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none"

// Sticky under the header plus 16 px: the header is 64 px tall from 768 px
// and 72 px from 1280 px (modules/layout/templates/nav).
const STICKY = "lg:sticky lg:top-20 xl:top-[88px]"

export const productLayout = {
  // Bottom spacing matches the home page's sections: 48 px, 96 px from 1280.
  page: "content-container pt-2 pb-12 md:pt-4 xl:pb-24",
  narrow: NARROW,
  columns:
    "mt-2 flex flex-col gap-6 lg:mt-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8",
  gallery: `${NARROW} lg:col-span-7 ${STICKY}`,
  buy: `${NARROW} flex flex-col gap-6 lg:col-span-5 ${STICKY}`,
  // "Complete the kit", full width, one section space below the buy block.
  related: "mt-12 xl:mt-24",
}
