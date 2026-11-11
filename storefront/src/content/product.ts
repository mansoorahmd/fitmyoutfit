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
  button: {
    /** The main button's label while the size is being added to the cart. */
    adding: "Adding…",
  },
  /** The sticky buy bar with more than one piece: "M × 4 · PKR 14,000". */
  stickyBar: {
    quantity: "{chosen} × {quantity}",
  },
  /**
   * The size chart (docs/design/05-m1-pages.md, section 3; ids W-S1 to
   * W-S7). DRAFT WORDING, founders to confirm. The measurements come from
   * the product's `metadata.size_chart`, never from here.
   */
  sizeChart: {
    /** W-S1: the link, the sheet's title and the accordion item. */
    title: "Size chart",
    /** W-S2 */
    draftTitle: "Draft measurements",
    /** W-S3 (P) */
    draftText:
      "These measurements may change before production. We'll update this chart when they're final.",
    /** W-S4 */
    howWeMeasure: "Measured on the garment laid flat.",
    /** W-S5: after the size chosen on the page. */
    yourChoice: "Your choice",
    /** W-S6: the fit kit page's inline section. */
    kitTitle: "Sizes in the kit",
    /** W-S7 */
    fitKitLink: { label: "Not sure? See the fit kit", href: `/products/${FIT_KIT_HANDLE}` },
    close: "Close size chart",
    sizeColumn: "Size",
    unitLabel: "Unit",
    units: { cm: "cm", in: "in" },
    /** The table's caption, for screen readers. */
    caption: "{product} size chart, in {unit}",
    unitNames: { cm: "centimetres", in: "inches" },
    /** A header with its unit: "Chest width (cm)". */
    columnWithUnit: "{label} ({unit})",
    /** A row with no value for a column. */
    missing: "–",
    missingLabel: "not measured",
    /** The scroll box when the table is wider than the screen. */
    scrollLabel: "Size chart table, scrolls sideways",
  },
  /**
   * The minimum order line in export regions (05, 5.2). The number is the
   * region's `min_garment_quantity` and the count is the backend's. Shown
   * only in development until the founders confirm the number (decision
   * 008, 4).
   */
  minimum: {
    show: process.env.NODE_ENV === "development",
    /** W-M1 (P) */
    line: "Minimum order: {n} garment pieces. Mix sizes and garments.",
    /** W-M2 */
    inCart: "You have {counted} in your cart.",
  },
  /** W-C6 (P): the fit kit's line in the cart. */
  fitKit: {
    deposit: "Refundable deposit",
  },
  /** Shown on garment pages only (lib/util/product-kind.ts), never on the extras. */
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
