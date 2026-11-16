// Which payment options step 2 offers, and why (docs/design/05-m1-pages.md,
// 6.5 b): from the region's payment providers and the backend's
// cash-on-delivery rule (GET /store/carts/:id/checkout-rules). The backend
// decides; this only reads what it said.

import { CheckoutRules } from "./checkout-rules"
import { convertToLocale } from "./money"

/** The placeholder payment, in all four regions, until a real gateway is approved. */
export const TEST_PROVIDER_ID = "pp_system_default"
/** Cash on delivery, Pakistan only (contract section 4). */
export const COD_PROVIDER_ID = "pp_cod_cod"

export type PaymentKind = "test" | "cod"

export type PaymentOptionView = {
  id: string
  kind: PaymentKind
  /** False for cash on delivery over the limit: shown, inactive, still focusable. */
  selectable: boolean
  /** Over the limit: the formatted limit ("PKR 20,000") for W-P4. */
  limit?: string
}

export type PaymentChoiceView = {
  options: PaymentOptionView[]
  /**
   * A quiet line under the group:
   * - "over_limit": W-P6, lower the total to use cash on delivery;
   * - "cod_failed": W-P7, the rules didn't load, so cash on delivery isn't offered.
   */
  notice: "over_limit" | "cod_failed" | null
}

/**
 * The options, in the specification's order (the placeholder, then cash on
 * delivery), for the providers the region has:
 * - the placeholder: always, when the region has it;
 * - cash on delivery, when the region has it:
 *   - available: a normal option;
 *   - over the limit: shown inactive with the limit;
 *   - refused for the region: not shown;
 *   - the rules didn't load (or can't be read): not shown, with W-P7.
 * A provider the storefront has no words for (a gateway added in the admin)
 * is not shown: its card would have no title.
 */
export const paymentChoice = ({
  providerIds,
  rules,
}: {
  providerIds: string[]
  rules: Pick<CheckoutRules, "cash_on_delivery"> | null
}): PaymentChoiceView => {
  const options: PaymentOptionView[] = []
  let notice: PaymentChoiceView["notice"] = null

  if (providerIds.includes(TEST_PROVIDER_ID)) {
    options.push({ id: TEST_PROVIDER_ID, kind: "test", selectable: true })
  }

  if (providerIds.includes(COD_PROVIDER_ID)) {
    const cod = rules?.cash_on_delivery
    if (!cod) {
      notice = "cod_failed"
    } else if (cod.available) {
      options.push({ id: COD_PROVIDER_ID, kind: "cod", selectable: true })
    } else if (cod.reason === "over_limit") {
      options.push({
        id: COD_PROVIDER_ID,
        kind: "cod",
        selectable: false,
        limit: convertToLocale({ amount: cod.limit, currency_code: cod.limit_currency_code }),
      })
      notice = "over_limit"
    }
    // reason "region" (or unreadable): not offered
  }

  return { options, notice }
}

/** The option with this id, when it can be chosen now. */
export const selectableOption = (
  choice: PaymentChoiceView,
  id: string | null | undefined
): PaymentOptionView | null =>
  (id && choice.options.find((o) => o.id === id && o.selectable)) || null

/**
 * The payment shown as chosen when the page loads: the cart's payment
 * session, else the one the customer chose before on this cart (kept in the
 * browser, because Medusa drops the session when the cart changes), when it
 * can still be chosen. Otherwise nothing: the customer chooses.
 */
export const initialPaymentId = ({
  choice,
  sessionProviderId,
  rememberedId,
}: {
  choice: PaymentChoiceView
  sessionProviderId: string | null | undefined
  rememberedId: string | null | undefined
}): string | null =>
  selectableOption(choice, sessionProviderId)?.id ??
  selectableOption(choice, rememberedId)?.id ??
  null

type SessionLike = { provider_id?: string | null; status?: string | null }

/**
 * The provider of the cart's live payment session, or null. A session that
 * is pending, requires more or is authorized counts; an errored or
 * cancelled one does not.
 */
export const sessionProviderId = (
  cart: { payment_collection?: { payment_sessions?: SessionLike[] | null } | null }
): string | null => {
  const live = (cart.payment_collection?.payment_sessions ?? []).find(
    (s) =>
      !!s?.provider_id &&
      (s.status === "pending" || s.status === "requires_more" || s.status === "authorized")
  )
  return live?.provider_id ?? null
}
