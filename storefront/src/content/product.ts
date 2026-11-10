// DRAFT WORDING. The founders will replace this wording. Every line restates
// a decision the founders have already made (critiques/DECISIONS.md,
// decision 007) and adds no new promise, number, price, time or guarantee.
// The product page's copy is data: keep these strings here and never write
// them into a component. The price words wrap the region's price from the
// backend; they add no price, tier or minimum of their own.

import type { RegionScope } from "@content/home"
import { listingContent } from "@content/listing"

/** The line icons the facts boxes can show (drawn in modules/home/components/line-icon). */
export type ProductFactIcon = "delivery" | "replacement" | "shipping" | "fit-kit"

/** A link, as a path without the country code (the localized link adds it). */
export type ProductLink = { label: string; href: string }

export type ProductFact = {
  icon: ProductFactIcon
  title: string
  text: string
  /** Who sees it: everyone, Pakistan only or export regions only. */
  showIn: RegionScope
  link?: ProductLink
  /** Left out on the fit kit's own page (it would point to itself). */
  hideOnFitKit?: boolean
}

/** The fit kit's handle; its page is /products/fit-kit. */
export const FIT_KIT_HANDLE = "fit-kit"

export const productContent = {
  breadcrumb: {
    /** The breadcrumb's accessible name. */
    label: "Breadcrumb",
    /** The first crumb: the listing, titled "Team kit". */
    parent: { label: listingContent.title, href: "/store" } as ProductLink,
  },
  price: {
    /** Before a size is chosen, when the sizes do not all cost the same. */
    fromPrefix: listingContent.card.pricePrefix,
    perPiece: listingContent.card.priceSuffix,
    /** Read before a struck-through price. */
    originalPrice: "Original price",
    /** While prices are placeholders and the region's tax is not final. */
    taxNote: "Tax not final",
    /** Export regions only. */
    exportNote: listingContent.exportNote,
  },
  size: {
    /** Under the size label when the main button is pressed with no size. */
    error: "Choose a size",
  },
  facts: [
    {
      icon: "delivery",
      title: "Delivered in 15 days",
      text: "From the day you approve your proof. 10 days with paid rush.",
      showIn: "all",
    },
    {
      icon: "replacement",
      title: "Free replacement",
      text: "Within 7 days, if the mistake is ours.",
      showIn: "all",
    },
    {
      icon: "shipping",
      title: "Shipping and duties included",
      text: "One box to the organizer, every jersey bagged and labelled.",
      showIn: "export",
    },
    {
      icon: "fit-kit",
      title: "Not sure of sizes?",
      text: "Order a fit kit and try the sizes on first. The deposit is refundable.",
      showIn: "all",
      link: { label: "See the fit kit", href: `/products/${FIT_KIT_HANDLE}` },
      hideOnFitKit: true,
    },
  ] as ProductFact[],
  details: {
    description: "Description",
    fabric: "Fabric and decoration",
    /** Row labels in "Fabric and decoration"; a row shows only with data. */
    rows: {
      material: "Fabric",
    },
  },
  gallery: {
    previous: "Previous image",
    next: "Next image",
    noPhoto: "Photo coming soon",
  },
}
