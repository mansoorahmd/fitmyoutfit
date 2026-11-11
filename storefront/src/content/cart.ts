// DRAFT WORDING. Founders to confirm (docs/design/05-m1-pages.md, section
// 11). The ids (W-C1 and so on) are the specification's. Sentences marked P
// there touch a promise, a payment or a rule and need the founders first.
// Numbers in braces come from the backend's data (the cart and
// GET /store/carts/:id/checkout-rules); none is written here. Lay these out
// in components; never write the words into a component.

export const cartContent = {
  /** W-C1: the page title, with the piece count after it. */
  title: "Your cart",
  pieces: { one: "1 piece", other: "{n} pieces" },
  /** W-C2: the summary's button. W-C2b: the phone's sticky bar. */
  checkout: "Go to checkout",
  checkoutShort: "Checkout",
  /** W-C10: the checkout button while a change is saved. */
  updating: "Updating…",
  /** W-C3: under the button, for guests only. */
  signIn: {
    prompt: "Have an account?",
    link: "Sign in",
    href: "/account?next=/cart",
  },
  /** No promotions exist yet: the promotion code field stays hidden. */
  showPromotionCode: false,
  line: {
    /** W-C4 */
    size: "Size: {size}",
    /** W-C5 */
    each: "{price} each",
    /** The stepper's accessible name (05, 2.7). */
    quantityLabel: "Quantity, {title}, size {size}",
    quantityLabelNoSize: "Quantity, {title}",
    /** The stepper's − and + buttons (not in the specification's list). */
    decrease: "Decrease quantity",
    increase: "Increase quantity",
    /** W-C9 */
    quantityRange: "Enter a number from 1 to {max}",
    /** W-C8 */
    quantityError: "We couldn't change the quantity. Try again.",
    /** W-C8b */
    removeError: "We couldn't remove this. Try again.",
    tryAgain: "Try again",
    remove: "Remove",
    removeLabel: "Remove {title}, size {size}",
    removeLabelNoSize: "Remove {title}",
  },
  /** W-C7: the toast after a removal, with its action. */
  removed: {
    text: "Removed: {title}, {size} × {quantity}",
    textNoSize: "Removed: {title} × {quantity}",
    undo: "Undo",
    close: "Close",
    /** Undo failed: the same words as a failed add (W-A5). */
    undoError: "We couldn't add this to your cart. Try again.",
  },
  summary: {
    /** "Items (5)": the count is the sum of quantities. */
    items: "Items ({n})",
    /** W-C11: Pakistan, before a delivery option is chosen. */
    deliveryAtCheckout: "Added at checkout",
    /** W-C12 (P): beside the duty-paid option, "Shipping & duties included". */
    deliveryIncluded: "Included",
    total: "Total",
    /** W-C13: Pakistan, before delivery is chosen. */
    totalBeforeDelivery: "Total before delivery",
    /** W-P4 (P): Pakistan, when the cart is over the cash on delivery limit. */
    codOverLimit: "Cash on delivery is for orders up to {limit}.",
    /** W-C14: the checkout rules could not be read. */
    rulesFailed: "Some details couldn't load. Refresh the page to try again.",
  },
  /** Minimum quantity in export regions (05, section 5). */
  minimum: {
    /** W-M3 */
    progress: "{counted} of {required} garment pieces",
    /** W-M4 (P) */
    missing: "Add {missing} more to check out. Mix any sizes and garments.",
    /** W-M5 (P): under a fit kit line, export regions only. */
    notCounted: "Not counted towards the minimum",
    /** W-M6 */
    reached: "Minimum reached: {counted} garment pieces",
    /** Announced once when the minimum is reached (05, 5.3). */
    reachedAnnouncement: "Minimum reached",
  },
  /** W-C15, W-C16: the empty cart. Its button and link are the home page's. */
  empty: {
    title: "Your cart is empty",
    text: "Start with a garment, or design your team's kit.",
  },
  /** The "Added to your cart" panel, inline box and snackbar (05, 4.7). */
  added: {
    /** W-A1 */
    title: "Added to your cart",
    /** W-A2 */
    summary: "{pieces} in your cart · {total}",
    /** W-A3 */
    viewCart: "View cart",
    /** W-A4 */
    keepShopping: "Keep shopping",
    /** W-A5 */
    error: "We couldn't add this to your cart. Try again.",
    close: "Close",
    /** The snackbar after an add from the sticky bar (05, 4.7; no id). */
    snackbar: "Added: {title}, {size} × {quantity}",
    snackbarNoSize: "Added: {title} × {quantity}",
    /** "× 4" on the added line. */
    times: "× {quantity}",
  },
  /** The header's cart link (05, 4.7, "Header badge"). */
  badge: {
    label: { one: "Cart, 1 item", other: "Cart, {n} items" },
    empty: "Cart, empty",
  },
}
