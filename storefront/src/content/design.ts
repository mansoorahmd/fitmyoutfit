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
