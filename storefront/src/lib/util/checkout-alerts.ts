// What the alert above "Place order" says for each outcome (docs/design/
// 05-m1-pages.md, 6.8), and what the button and the focus do then. The
// words come from content/checkout.ts; this only chooses and fills them.

import { checkoutContent } from "@content/checkout"
import { errorContent } from "@content/errors"

import { RefusalView } from "./checkout-order"
import { fill } from "./wording"

export type PlaceOrderAlertState =
  | { kind: "refusal"; refusal: RefusalView }
  | { kind: "payment_failed" }
  /** No answer: the order may exist. `rechecked`: "Check my order" got no answer either. */
  | { kind: "unknown"; rechecked?: boolean }
  /** "Check my order" found the order, but couldn't open it just now. */
  | { kind: "placed" }
  | { kind: "cart_lost" }
  /** HTTP 5xx: the order may or may not exist (QA S1-4, D13). */
  | { kind: "server" }

export type PlaceOrderAlert = {
  /** "success" only when the order is known to exist. */
  variant: "error" | "success"
  title: string
  text?: string
  /** One action in the alert. */
  action?: "back_to_cart" | "check_order" | "go_to_cart"
  /**
   * The main button then reads "Try again" instead of "Place order" (the
   * spec's primary "Try again", kept as the one red button on the page).
   */
  retryLabel: boolean
  /** The main button is not shown: the alert's action is the next step. */
  hidePlaceOrder: boolean
  /** Where focus goes: the alert, or the payment choice. */
  focus: "alert" | "payment"
  /** Cash on delivery was refused: it is deselected. */
  deselectCod: boolean
}

const { errors, minimum } = checkoutContent

export const placeOrderAlert = (state: PlaceOrderAlertState): PlaceOrderAlert => {
  const base = {
    variant: "error" as const,
    retryLabel: false,
    hidePlaceOrder: false,
    focus: "alert" as const,
    deselectCod: false,
  }
  switch (state.kind) {
    case "refusal": {
      const r = state.refusal
      if (r.kind === "minimum") {
        return {
          ...base,
          title: fill(minimum.title, { required: r.required }),
          text: fill(minimum.text, { counted: r.counted, missing: r.missing }),
          action: "back_to_cart",
        }
      }
      if (r.kind === "cod_over_limit") {
        return {
          ...base,
          title: errors.codTitle,
          text: fill(errors.codOverLimit, { limit: r.limit, total: r.total }),
          focus: "payment",
          deselectCod: true,
        }
      }
      if (r.kind === "cod_region") {
        return {
          ...base,
          title: errors.codTitle,
          text: errors.codRegion,
          focus: "payment",
          deselectCod: true,
        }
      }
      return {
        ...base,
        title: errors.refusedTitle,
        text: errors.refusedText,
        action: "back_to_cart",
        retryLabel: true,
      }
    }
    case "payment_failed":
      return {
        ...base,
        title: errors.paymentTitle,
        text: errors.paymentText,
        retryLabel: true,
        focus: "payment",
      }
    case "unknown":
      return {
        ...base,
        title: errors.lostTitle,
        text: state.rechecked ? errors.lostRecheckText : errors.lostText,
        action: "check_order",
        hidePlaceOrder: true,
      }
    case "placed":
      // never "Place order" again: the order exists
      return {
        ...base,
        variant: "success",
        title: errors.placedTitle,
        text: errors.placedText,
        action: "check_order",
        hidePlaceOrder: true,
      }
    case "cart_lost":
      return {
        ...base,
        title: errors.expiredTitle,
        text: errors.expiredText,
        action: "go_to_cart",
        hidePlaceOrder: true,
      }
    case "server":
      // A 5xx may come after the order was made: check before trying again.
      return {
        ...base,
        title: errorContent.server.title,
        text: errors.serverText,
        action: "check_order",
        hidePlaceOrder: true,
      }
  }
}
