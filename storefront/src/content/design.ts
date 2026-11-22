// DRAFT WORDING. Founders to confirm. The 3D designer inside the store (task
// S1-12): the button on the product page, the notice after "Done", and the
// designer page's own loading and failure messages. The designer's own
// sentences live in the editor package. Nothing here promises a date or a
// price: ordering a designed kit as a team order does not exist yet.

export const designContent = {
  /** The product page's way in. The second label shows when this device has a saved design. */
  button: {
    start: "Design your kit",
    resume: "Continue your design",
  },
  /**
   * The garment chooser (/design) and the ways in and out of the designer. DRAFT WORDING.
   * Only garments that have a 3D model are listed (lib/editor/products.ts); prices are the listing's.
   */
  chooser: {
    title: "Design your kit",
    text: "Pick a garment, then design it in 3D. Add your players when you are ready.",
    metaDescription: "Choose a garment and design your team's kit in 3D.",
    /** On each card, under the price. */
    cardAction: "Design this kit",
    /** On a card when this device has a saved design for it. */
    cardResume: "Continue your design",
    /** More garments are on the way: said once, under the cards. */
    more: "More garments are coming.",
    empty: {
      title: "No garments to design here yet",
      text: "You can still look at the products.",
      link: { label: "See the products", href: "/store" },
    },
    /** The garments could not be read. */
    failed: {
      title: "We couldn't load the garments",
      text: "Check your connection and try again.",
      retry: "Try again",
    },
  },
  /**
   * The garment chooser inside the designer (the editor's own sheet, G4). DRAFT WORDING. `inOrder` replaces the sheet's
   * sentence in a team order, where only the necks of the order's garment are offered.
   */
  garments: {
    inOrder: "This team order is for one garment, so only its necks are here. To design another garment, start a new team order.",
  },
  /** The designer's own menu: the store's way out that never loses work. DRAFT WORDING. */
  leave: {
    menuLabel: "Store menu",
    menuTitle: "Leave the designer",
    /** Said under the title: nothing is lost by leaving. */
    note: "Your design and team list are saved before you leave.",
    home: "Home",
    product: "Back to the product",
    changeGarment: "Change garment",
    /** Under "Change garment" in a team order where the designer does not offer a garment change. DRAFT WORDING. */
    garmentInOrder: "A team order is for one garment. To design another garment, start a new team order.",
    account: "Account",
    teamOrders: "Team orders",
    signIn: "Sign in",
    thisOrder: "This team order",
    close: "Close menu",
  },
  /** The designer page's tab title is "<title> | <store>". */
  pageTitle: "Design your kit",
  /** Shown while the editor's code and the model arrive. */
  loading: "Loading the 3D designer…",
  /** The page for a browser that cannot show 3D. */
  noWebgl: {
    title: "This browser can't show the 3D designer",
    text: "Try another browser, or update this one. Your product page works as before.",
  },
  /** The page when the designer's code or the model did not load. */
  failed: {
    title: "The 3D designer did not load",
    text: "Check your connection and try again.",
    retry: "Try again",
  },
  /** The way back from both messages. */
  back: "Back to the product",
  /** On the product page after "Done". */
  saved: {
    title: "Your design is saved on this device.",
    text: "Ordering a designed kit as a team order is not available yet.",
    dismiss: "Close this message",
  },
  /** The model's credit, shown by the designer (a CC BY duty). */
  credit: {
    long: { prefix: "3D model:", by: "by", changed: ", changed by us" },
    short: { prefix: "3D model by", changed: ", changed" },
  },
}
