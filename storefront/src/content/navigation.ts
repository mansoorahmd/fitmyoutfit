// Words in the header and the menu, kept as data like the home page copy.
// Only pages that exist are linked: "How team orders work", "Help" and the
// other groups in the design spec are added when their pages are built.
// The garment links come from the garments collection, not from here.

export const navigationContent = {
  /** Shown beside the wordmark from 768 px. Decision 007. */
  tagline: "Custom team kit",
  menuButtonLabel: "Menu",
  regionHeading: "Region",
  garmentsHeading: "Garments",
  /** Plain links at the bottom of the menu drawer, paths without the country code. */
  drawerLinks: [
    { label: "Store", href: "/store" },
    { label: "Account", href: "/account" },
    { label: "Cart", href: "/cart" },
  ],
  /** From 1280 px the header shows these beside the garment links. */
  accountLink: { label: "Account", href: "/account" },
}
