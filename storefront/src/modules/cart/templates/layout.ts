// Class names for the cart page's layout (docs/design/05-m1-pages.md, 2.2
// and 4.2), kept apart so the rules can be tested without rendering.
// Below 1024 px one column, centred at 560 px from 768 px. From 1024 px the
// lines take 7/12 and the summary 5/12, sticky under the header + 16 px,
// with 48 px between them.

const NARROW = "mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none"

export const cartLayout = {
  page: "content-container pt-6 pb-12 md:pt-8 xl:pb-24",
  columns: "flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12",
  main: `${NARROW} flex flex-col gap-6 lg:col-span-7`,
  aside: `${NARROW} flex flex-col gap-4 lg:col-span-5 lg:sticky lg:top-20 xl:top-[88px]`,
  // The summary box: a plain block on phones (the lines' bottom divider is
  // above it), a 24 px padded box from 1024 px.
  summaryBox:
    "flex flex-col gap-4 lg:rounded-card lg:border lg:border-brand-border-strong lg:p-6",
}
