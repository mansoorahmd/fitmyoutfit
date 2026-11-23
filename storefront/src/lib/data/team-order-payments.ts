"use server"

import { parsePaymentsAnswer, parseStartAnswer, type PartName, type PaymentsView, type StartedPayment } from "@lib/team-order/payments"
import type { Outcome } from "@lib/team-order/types"

import { teamCall } from "./team-call"

// The money of a team order (docs/contracts/m3-team-order-payments.md, section 4), called with the customer's
// own token from the cookie, in the style of team-orders.ts: plain data or a Failure, never a thrown error,
// never the backend's message. Nothing here logs: an amount, a session or a name never reaches a log line.
// The amount is never sent: it is the rule's, from the order's total.

const enc = encodeURIComponent

/** GET /store/team-orders/:id/payments: what the team order costs and what is paid. A draft has no price (a refusal). */
export async function retrievePayments(id: string): Promise<Outcome<PaymentsView>> {
  return teamCall({ method: "GET", path: `/store/team-orders/${enc(id)}/payments`, read: parsePaymentsAnswer })
}

/** POST .../payments/:part: starts paying the deposit or the balance. The answer says what to do next (`next`). */
export async function startPayment(id: string, part: PartName): Promise<Outcome<StartedPayment>> {
  return teamCall({
    method: "POST",
    path: `/store/team-orders/${enc(id)}/payments/${part}`,
    body: {},
    read: parseStartAnswer,
  })
}

/** POST .../payments/:part/complete: completes the payment with the session that was started. Two at once pay once. */
export async function completePayment(id: string, part: PartName, sessionId: string): Promise<Outcome<PaymentsView>> {
  return teamCall({
    method: "POST",
    path: `/store/team-orders/${enc(id)}/payments/${part}/complete`,
    body: { session_id: sessionId },
    read: parsePaymentsAnswer,
  })
}
