// Words and links in the footer, kept as data like the header's. Only pages
// that exist are linked (paths without the country code). The garment links
// (Jersey, T-Shirt, Jacket) come from the garments collection and are put
// in front of "Fit kit"; the spec's Help and Company columns, payment logos
// and the legal name and address wait for their pages and the founders.

import { homeContent } from "./home"

export type FooterLink = { label: string; href: string }

export const footerContent = {
  shop: {
    heading: "Shop",
    /** After the garments. */
    links: [{ label: "Fit kit", href: "/products/fit-kit" }] as FooterLink[],
  },
  teamOrders: {
    heading: "Team orders",
    links: [
      // "#…" after the country code gives "/pk#how-team-orders-work".
      { label: "How it works", href: `#${homeContent.howItWorks.id}` },
    ] as FooterLink[],
  },
  account: {
    heading: "Account",
    links: [
      { label: "Sign in", href: "/account" },
      { label: "Cart", href: "/cart" },
    ] as FooterLink[],
    /** For a signed-in customer, in place of "Sign in" (the header says "Account" too). */
    signedInLink: { label: "Your account", href: "/account" } as FooterLink,
  },
  regionLabel: "Region",
  /** After "© <year> <store name>." */
  rightsLine: "All rights reserved.",
}
