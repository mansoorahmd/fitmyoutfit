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
  | { kind: "unknown" }
  | { kind: "cart_lost" }
  | { kind: "server" }

export type PlaceOrderAlert = {
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
        text: errors.lostText,
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
      return { ...base, title: errorContent.server.title }
  }
}
