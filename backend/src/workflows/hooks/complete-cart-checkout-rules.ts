/**
 * Enforces the checkout rules when a cart is completed (POST /store/carts/:id/complete, a payment
 * provider's webhook, or any other caller of Medusa's completeCartWorkflow).
 *
 * Medusa's `validate` hook runs after the cart and its payment sessions are read and before the
 * order is created and the payment is authorized, so a refusal here charges nothing and creates
 * no order. The route answers with HTTP 400 and Medusa's usual error body (`type: "not_allowed"`,
 * `message`).
 *
 * Refused: below the minimum, and cash on delivery when it is not available. Never for a metadata
 * reason (decision 010): the promised delivery date is written on the order after it is created
 * (subscribers/order-placed-delivery-promise.ts), and cash collection is kept in a table of its
 * own (modules/cash-collection), not in metadata, so a `cod_` key a cart may carry means nothing
 * and a webhook that completes a cart never loses the order over it. The reserved keys are still
 * refused at the door (api/middlewares.ts).
 *
 * The rush line (docs/contracts/m1-checkout.md, section 9) is priced once more just before
 * completion (api/middlewares.ts, priceRushBeforeCompletion) and after every cart change. Here it
 * is checked on exactly the data the order is about to be made from (Medusa read the cart once,
 * before this hook, and builds the order from that read): if that data holds a rush line that does
 * not equal the rule for its garment lines, no order is made and the completion answers HTTP 409
 * (`type: "conflict"`), as Medusa does when the cart is being completed at the same moment. That
 * happens only when the cart changed while it was being completed (a second server instance, or
 * `rush_percentage` changed in that instant): the line is priced again by then, and completing
 * again uses the new figure. So no order ever has a rush line cheaper (or dearer) than the rule.
 *
 * Medusa allows one handler per workflow hook: every later check at cart completion (team orders,
 * deposits) goes into this file, not into a second hook file.
 *
 * Thin: the rules are in lib/rules/, the loading in ../checkout-rules/ and ../rush/.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { isRushKind, rushMismatch } from "../../lib/rules/rush-charge"
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"
import { assertCheckoutAllowed } from "../checkout-rules/load-checkout-rules"
import { currencyDigits, productKinds, rushPercentage, ruleLine, type RawLineItem } from "../rush/rush-cart"

type HookCart = {
  id: string
  currency_code?: string
  completed_at?: unknown
  items?: RawLineItem[] | null
  payment_collection?: {
    payment_sessions?: ({ provider_id?: string | null } | null)[] | null
  } | null
}

/** What the customer is told when the rush line changed while the cart was being completed. */
export const RUSH_CHANGED_DURING_COMPLETION =
  "The cart changed while it was being completed: the rush charge was updated. Complete the cart again."

/** Refuses (HTTP 409) when the data the order is made from holds rush that differs from the rule. */
async function assertRushAsTheRuleSays(container: MedusaContainer, cart: HookCart): Promise<void> {
  const items = (cart.items ?? []).flatMap((item) => (item ? [item] : []))
  const kinds = await productKinds(container, items.map((item) => item.product_id))
  const lines = items.map((item) => ruleLine(item, item.product_id ? kinds.get(item.product_id) : undefined))
  if (!lines.some((line) => isRushKind(line.kind))) {
    return
  }
  const mismatch = rushMismatch(
    lines,
    await rushPercentage(container),
    await currencyDigits(container, cart.currency_code ?? "")
  )
  if (mismatch) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Completion of cart ${cart.id} refused: ${mismatch}. It is priced again; completing again works.`)
    throw new MedusaError(MedusaError.Types.CONFLICT, RUSH_CHANGED_DURING_COMPLETION)
  }
}

completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const hookCart = cart as HookCart
  // A cart that already became an order is being completed again (Medusa returns the existing
  // order): nothing new is created or charged, so the rules are not applied a second time.
  if (hookCart.completed_at) {
    return
  }
  const usesCashOnDelivery = (hookCart.payment_collection?.payment_sessions ?? []).some(
    (session) => session?.provider_id === COD_PAYMENT_PROVIDER_ID
  )
  await assertCheckoutAllowed(container, hookCart.id, {
    usesCashOnDelivery,
    checkMinimum: true,
  })
  await assertRushAsTheRuleSays(container, hookCart)
})

