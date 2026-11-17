// The rush option (docs/contracts/m1-checkout.md, section 9; decision 011):
// one cart line of the "Rush Production" product (kind `rush_add_on`),
// priced by the server as a percentage of the garments. What the storefront
// shows of it, worked out here as plain data:
// - the "Delivery speed" control (Standard or Rush), from the rules route;
// - the "Rush production" row in every summary, from the line itself;
// - the lines, the "Items (n)" row and every piece count without it.
// Nothing here prices rush or works out a date: both are the backend's.

import { CheckoutRules, RushRule } from "./checkout-rules"
import { convertToLocale } from "./money"
import { productKind } from "./product-kind"

export type DeliverySpeed = "standard" | "rush"

type KindLike = { product?: { metadata?: Record<string, unknown> | null } | null }

/** The line is the rush add-on: never listed with the products, never counted as a piece. */
export const isRushLine = (item: KindLike | null | undefined): boolean =>
  productKind(item?.product) === "rush_add_on"

/** The lines without the rush line, in their order. A copy. */
export const withoutRush = <T extends KindLike>(items: T[] | null | undefined): T[] =>
  (items ?? []).filter((item) => !isRushLine(item))

type AmountLike = KindLike & {
  subtotal?: number | null
  unit_price?: number | null
  quantity?: number | null
}

/**
 * What the cart (or order) charges for rush: its rush line's subtotal
 * (before tax, like the items row's `item_subtotal`), or null when it holds
 * none. A line read without its subtotal counts its unit price.
 */
export const rushLineAmount = (items: AmountLike[] | null | undefined): number | null => {
  const lines = (items ?? []).filter(isRushLine)
  if (lines.length === 0) {
    return null
  }
  // Prices are in major units with at most 2 decimals; avoid 0.1 + 0.2 drift.
  const sum = lines.reduce(
    (total, line) =>
      total + (typeof line.subtotal === "number" ? line.subtotal : (line.unit_price ?? 0) * (line.quantity ?? 1)),
    0
  )
  return Math.round(sum * 100) / 100
}

export type SummaryAmounts = {
  /** The "Items (n)" row: garments and the fit kit, never rush. */
  items: number
  /** The "Rush production" row, or null when there is none. */
  rush: number | null
}

/**
 * The items row and the rush row from one `item_subtotal` (which counts
 * every line, the rush line too), so that items + rush is what the
 * backend's subtotal says.
 */
export const summaryAmounts = (
  itemSubtotal: number | null | undefined,
  items: AmountLike[] | null | undefined
): SummaryAmounts => {
  const rush = rushLineAmount(items)
  const all = itemSubtotal ?? 0
  return {
    items: rush === null ? all : Math.round((all - rush) * 100) / 100,
    rush,
  }
}

/** The "Delivery speed" control (two radio cards) as the cart page and checkout step 2 show it. */
export type RushControlView = {
  /** The card that is chosen: the backend's `rush.in_cart`. */
  chosen: DeliverySpeed
  /** "YYYY-MM-DD" from the rules, or null when the rules have none (the card then says no date). */
  standardDate: string | null
  rushDate: string | null
  /** The rules' `rush.amount`, formatted in the cart's currency: "PKR 400". */
  amount: string
  /**
   * The rules' `rush.percentage`, as the backend gave it (20, or 12.5); null
   * while the cart's rush line is out of line with it, because the card then
   * shows the line's amount and the percentage would not match it (S1-11).
   */
  percentage: number | null
}

/**
 * The control, or null when it isn't shown: rush is shown only when the
 * rules say it is offered (`rush.available`: a garment in the cart and a
 * percentage above 0). Without rules, or without the rush part, nothing
 * shows and the cart looks as it did before rush existed.
 */
export const rushControlView = (
  rules: Pick<CheckoutRules, "rush" | "delivery_promise"> | null | undefined,
  currencyCode: string,
  items?: AmountLike[] | null
): RushControlView | null => {
  const rush = rules?.rush
  if (!rush || !rush.available) {
    return null
  }
  // The cart's own rush line is what the summary and the total show; if it
  // still holds another figure than the rules' (and couldn't be brought in
  // line), the card shows the line's, so a screen never has two amounts.
  const outOfLine = rushOutOfLine(rules, items)
  const amount = outOfLine ? (rushLineAmount(items) ?? rush.amount) : rush.amount
  const promise = rules?.delivery_promise
  return {
    chosen: rush.in_cart ? "rush" : "standard",
    standardDate: promise?.standard?.date ?? null,
    rushDate: promise?.rush?.date ?? null,
    amount: convertToLocale({ amount, currency_code: currencyCode || rush.currency_code }),
    percentage: outOfLine ? null : rush.percentage,
  }
}

/**
 * A rush line the cart still holds while rush is no longer offered (staff
 * set the percentage to 0, or the rush line outlived its garments): the
 * page takes it off before showing the cart, so the customer never sees a
 * charge for something the store no longer offers. The backend's DELETE
 * works even when the setting is invalid (contract 9).
 */
export const rushIsStale = (rules: { rush?: RushRule | null } | null | undefined): boolean =>
  !!rules?.rush && !rules.rush.available && rules.rush.in_cart

/**
 * The cart holds a rush line whose amount is not the rules' amount (staff
 * changed the percentage and nothing has priced the cart since). Only while
 * rush is offered and in the cart; a stale line is rushIsStale's case.
 */
export const rushOutOfLine = (
  rules: { rush?: RushRule | null } | null | undefined,
  items: AmountLike[] | null | undefined
): boolean => {
  const rush = rules?.rush
  const line = rushLineAmount(items)
  return !!rush && rush.available && rush.in_cart && line !== null && Math.round(line * 100) !== Math.round(rush.amount * 100)
}

/** What a press on a card asks the backend for: add, remove, or nothing (it is chosen already). */
export const rushRequest = (current: DeliverySpeed, wanted: DeliverySpeed): "add" | "remove" | null =>
  current === wanted ? null : wanted === "rush" ? "add" : "remove"

/** How saving the choice ended, by the backend's answer. */
export type RushSaveResult =
  | { ok: true }
  /** 400: rush isn't offered for this cart (any more); the page reads the rules again. */
  | { ok: false; kind: "refused" }
  /** 409 twice: the cart was being changed by another request. Nothing changed. */
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "cart_lost" }
  | { ok: false; kind: "server" }
  /** No answer: the change may or may not have been made; the page reads the cart again. */
  | { ok: false; kind: "no_answer" }

/** The answer to POST or DELETE /store/carts/:id/rush, by its status (never its message). */
export const rushSaveResult = (call: { ok: true } | { ok: false; status?: number }): RushSaveResult => {
  if (call.ok) return { ok: true }
  const status = call.status
  if (typeof status !== "number") return { ok: false, kind: "no_answer" }
  if (status === 409) return { ok: false, kind: "conflict" }
  if (status === 404) return { ok: false, kind: "cart_lost" }
  if (status >= 500) return { ok: false, kind: "server" }
  if (status >= 400) return { ok: false, kind: "refused" }
  return { ok: false, kind: "no_answer" }
}

/** A 409 is sent again once by itself before anything is said (contract 9: nothing changed, send it again). */
export const RUSH_CONFLICT_RETRIES = 1

/**
 * The server action's time limit for saving the choice, both tries
 * together. A backend that doesn't answer in time is "no answer": the
 * control says so and the page reads the cart again, so a hung request
 * never leaves the control spinning and "Place order" waiting for good.
 */
export const RUSH_SAVE_SERVER_MS = 15_000

/**
 * A save that ended with "no answer" may still be made by the backend
 * after the page gave up (it answered at 19 s when the page's limit is
 * 15 s). The page reads the cart again by itself, twice and no more:
 * this long after the "no answer", and this long after the first of the two.
 */
export const RUSH_LATE_READ_FIRST_MS = 5_000
export const RUSH_LATE_READ_SECOND_MS = 15_000

/**
 * Saves the choice: one request, and on HTTP 409 the same request again,
 * at most RUSH_CONFLICT_RETRIES times.
 */
export const saveRushChoice = async (
  send: () => Promise<{ ok: true } | { ok: false; status?: number }>
): Promise<RushSaveResult> => {
  let result = rushSaveResult(await send())
  for (let retry = 0; retry < RUSH_CONFLICT_RETRIES && !result.ok && result.kind === "conflict"; retry++) {
    result = rushSaveResult(await send())
  }
  return result
}

/**
 * Cash on delivery is over the limit while the cart holds rush: the
 * over-limit hint adds that choosing Standard lowers the total, with the
 * Standard choice one tap away. Only when the control is shown (rush is
 * offered and in the cart).
 */
export const codHintMentionsRush = (
  rules: Pick<CheckoutRules, "cash_on_delivery" | "rush"> | null | undefined
): boolean =>
  !!rules?.cash_on_delivery &&
  !rules.cash_on_delivery.available &&
  rules.cash_on_delivery.reason === "over_limit" &&
  !!rules.rush?.available &&
  rules.rush.in_cart
