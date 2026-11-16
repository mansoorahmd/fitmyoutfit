// Class names for the checkout's layout (docs/design/05-m1-pages.md, 2.2 and
// 6.3), kept apart so the rules can be tested without rendering. Below
// 1024 px one column, centred at 560 px from 768 px. From 1024 px the steps
// take 7/12 (at most 640 px) and the summary box 5/12, sticky under the
// header + 16 px, with 48 px between them.
//
// `summaryCollapsed` is for what stands in for the summary box where the box
// is not displayed: the "Show order summary" bar and step 2's "Check your
// order". It must switch at the same width as `aside` (`lg`), so the order
// lines are never shown twice and never missing.

export const checkoutLayout = {
  page: "content-container pt-4 pb-12 md:pt-6 xl:pb-24",
  columns: "mt-4 flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12",
  main: "mx-auto flex w-full min-w-0 max-w-[560px] flex-col gap-8 lg:col-span-7 lg:mx-0 lg:max-w-[640px]",
  aside: "hidden lg:col-span-5 lg:sticky lg:top-[72px] lg:block",
  summaryCollapsed: "lg:hidden",
}
