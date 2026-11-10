// DRAFT WORDING for the product listing, the product card and the related
// products block. The founders will replace it. The price words wrap the
// region's price from the backend ("from PKR 3,500", "per piece"); they add
// no price, tier or minimum of their own.

export const listingContent = {
  /** The /store page title (h1). */
  title: "Team kit",
  /** The page's meta description (search results, link previews). */
  metaDescription: "Jerseys, T-shirts and jackets for your team.",
  /**
   * Under the title in export regions only. Restates the decided promise
   * (duty-paid shipping abroad) in the home page's words. The minimum order
   * is not shown until the founders set it (decision 007).
   */
  exportNote: "Shipping and duties included",
  empty: {
    message: "No garments in this region yet",
    link: { label: "Go to the home page", href: "/" },
  },
  card: {
    pricePrefix: "from",
    priceSuffix: "per piece",
  },
  /** The product page's block with the other garments. */
  relatedTitle: "Complete the kit",
}
