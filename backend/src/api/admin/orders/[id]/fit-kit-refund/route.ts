/**
 * "Kit returned: refund the deposit", for staff in the admin (the order page's panel,
 * src/admin/widgets/fit-kit-refund.tsx). Admin routes need a signed-in admin user; Medusa checks
 * that before these handlers run. The rule is lib/rules/fit-kit-refund.ts; this is thin.
 *
 * GET  /admin/orders/:id/fit-kit-refund
 *   The order's fit kit state: `applies` (the order has a fit kit line; the panel shows only
 *   then), `kits_total`, `kits_returned`, `kits_left`, `refunded_amount`, `amounts_by_quantity`
 *   (what returning 1, 2, ... kits refunds, in the order's currency's units), `can_refund` with
 *   `reason` (a code) and `message` when not, `method` (`medusa`: through Medusa's refund workflow
 *   on the payment that paid; `by_hand`: cash on delivery, no money is moved by the store),
 *   `currency_code`, and `returns`: the record (quantity, amount, method, who, when).
 *
 * POST /admin/orders/:id/fit-kit-refund  { "quantity": 1 }
 *   Refunds the return of `quantity` kits (1 up to `kits_left`), under the order's lock (the lock
 *   of the cash on delivery panel and of Medusa's cancel route), and answers the new state with
 *   `refunded: { quantity, amount, method }`. Only `quantity` is read from the body: the amount is
 *   worked out from the order, whatever the body says.
 *   Refusals, HTTP 400 `not_allowed` with `code`: `no_fit_kit`, `order_canceled`, `not_paid`,
 *   `nothing_to_refund`, `invalid_quantity`, `return_window_over`, `payment_refunded_elsewhere`.
 *   HTTP 404 `order_not_found`. HTTP 409 `order_busy` (another request held the order's lock for
 *   too long; nothing was done). HTTP 500 `refund_failed` (nothing recorded) or `record_failed`
 *   (the payment is refunded; do not press again).
 *
 * Every message is a sentence for staff, never SQL, a stack trace or an internal id.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { bodyOf, Refusal, withRefusals } from "../../../../../lib/http/refusal"
import { STATE_READ_FAILURE_MESSAGE } from "../../../../../lib/rules/fit-kit-refund"
import { loadKitState, refundKits, userEmails } from "../../../../../workflows/fit-kit/fit-kit-refund"

async function describe(container: MedusaContainer, orderId: string) {
  const { state, returns, currencyCode, currencyDigits } = await loadKitState(container, orderId)
  const emails = await userEmails(container, [...new Set(returns.map((r) => r.actor_id))])
  return {
    fit_kit: {
      ...state,
      currency_code: currencyCode,
      currency_digits: currencyDigits,
      returns: returns.map((r) => ({
        quantity: r.quantity,
        amount: r.amount,
        method: r.method,
        by: r.actor_id,
        by_email: emails[r.actor_id] ?? null,
        at: r.created_at,
      })),
    },
  }
}

/** A failure that is not one of ours is logged by name and answered with a general sentence. */
async function forStaff<T>(container: MedusaContainer, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof Refusal) throw error
    container.resolve(ContainerRegistrationKeys.LOGGER).error(`Fit kit refund failed: ${(error as Error)?.name ?? "Error"}`)
    throw new Refusal(500, "not_allowed", "state_unavailable", STATE_READ_FAILURE_MESSAGE)
  }
}

export const GET = withRefusals(async (req, res: MedusaResponse) => {
  res.json(await forStaff(req.scope, () => describe(req.scope, req.params.id)))
})

export const POST = withRefusals(async (req, res: MedusaResponse) => {
  const actorId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
  if (!actorId) {
    throw new Refusal(401, "not_allowed", "unauthorized", "Sign in as an admin user.")
  }
  const orderId = req.params.id
  const refunded = await forStaff(req.scope, () =>
    refundKits(req.scope, { order_id: orderId, quantity: bodyOf(req).quantity, recorded_by: actorId })
  )
  res.json({ ...(await describe(req.scope, orderId)), refunded })
})
