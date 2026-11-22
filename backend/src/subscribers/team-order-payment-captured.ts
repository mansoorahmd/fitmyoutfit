/**
 * A payment was captured (Medusa's `payment.captured`): if it belongs to a team order's deposit or
 * balance, the step it causes is made (decision 016): a paid deposit moves the order `approved ->
 * deposit_paid` (by the system, or by the admin named on the capture), a paid balance is recorded
 * once at `balance_due`. This covers the captures our own routes do not make: Medusa's own "Mark as
 * paid" or "Capture" buttons on the order page, and later a payment gateway's webhook. Our routes
 * make the step themselves; this then finds nothing to do. Reading the order makes it too, so a
 * missed event heals.
 *
 * A failure is logged, not thrown (no payment's details, no person in the line).
 */
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules, PaymentEvents } from "@medusajs/framework/utils"
import { syncPaymentSteps, teamOrderOfCollection } from "../workflows/team-order/payments"

export default async function teamOrderPaymentCaptured({ event: { data }, container }: SubscriberArgs<{ id: string }>): Promise<void> {
  try {
    const payment = await container.resolve(Modules.PAYMENT).retrievePayment(data.id, { select: ["id", "payment_collection_id"] })
    const teamOrderId = await teamOrderOfCollection(container, payment.payment_collection_id)
    if (teamOrderId) await syncPaymentSteps(container, teamOrderId)
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`Could not make the team-order step of payment ${data.id}: ${error instanceof Error ? error.name : "Error"}.`)
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
