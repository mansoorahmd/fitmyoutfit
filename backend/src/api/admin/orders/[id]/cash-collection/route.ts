/**
 * Cash on delivery collected, for staff in the admin (the order page's panel,
 * src/admin/widgets/cash-on-delivery-collected.tsx). Admin routes need a signed-in admin user;
 * Medusa checks that before these handlers run.
 *
 * GET  /admin/orders/:id/cash-collection
 *   The order's state (lib/rules/cash-collection.ts): whether it is paid by cash on delivery
 *   (`applies`; the panel shows only then), its `stage` (not_collected, partly_captured,
 *   captured_without_slip, recorded, unavailable), whether a slip reference may be recorded now
 *   and whether that captures the payment, the recorded slip reference and time, and who captured
 *   and when (from Medusa's own capture record, not from the order's metadata).
 *
 * POST /admin/orders/:id/cash-collection  { "slip_reference": "..." }
 *   Captures the cash-on-delivery payment if it is still open, then keeps the slip reference on
 *   the order (workflows/cash-collection/mark-cash-collected.ts). Answers with the new state.
 *   Refused with HTTP 400: `invalid_data` for a missing or invalid reference, `not_allowed` when
 *   the order is not cash on delivery, already recorded, partly captured or canceled, or when
 *   another press recorded it at the same moment. A capture that fails answers HTTP 500 with a
 *   message saying what happened and what to do; nothing is recorded then.
 *
 * Thin: the rule is in lib/rules/cash-collection.ts.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { acquireLockStepId } from "@medusajs/medusa/core-flows"
import { captureFailureMessage, refusalMessage } from "../../../../../lib/rules/cash-collection"
import { loadCashCollection } from "../../../../../workflows/cash-collection/load-cash-collection"
import {
  DECIDE_CASH_COLLECTION_STEP,
  markCashCollectedWorkflow,
  RECORD_CASH_COLLECTED_STEP,
} from "../../../../../workflows/cash-collection/mark-cash-collected"

/** The state, with the capturing user's email for the panel. */
async function describe(container: MedusaContainer, orderId: string) {
  const { state } = await loadCashCollection(container, orderId)
  let capturedByEmail: string | null = null
  if (state.captured_by) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "user",
      fields: ["email"],
      filters: { id: state.captured_by },
    })
    capturedByEmail = (data as unknown as { email?: string }[])[0]?.email ?? null
  }
  return {
    cash_collection: {
      applies: state.applies,
      stage: state.stage,
      collected: state.collected,
      can_record: state.can_record,
      capture_needed: state.capture_needed,
      reason: state.reason,
      slip_reference: state.slip_reference,
      collected_at: state.collected_at,
      amount: state.amount,
      captured_amount: state.captured_amount,
      captured_by: state.captured_by,
      captured_by_email: capturedByEmail,
      captured_at: state.captured_at,
    },
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  res.json(await describe(req.scope, req.params.id))
}

type StepFailure = { action?: string; error?: { type?: string; message?: string } | null }

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in as an admin user.")
  }
  const orderId = req.params.id
  const body = (req.body ?? {}) as { slip_reference?: unknown }
  const { errors, result } = await markCashCollectedWorkflow(req.scope).run({
    input: { order_id: orderId, slip_reference: body.slip_reference, recorded_by: actorId },
    throwOnError: false,
  })

  const failure = (errors as StepFailure[] | undefined)?.[0]
  if (failure) {
    const cause = failure.error?.message ?? ""
    if (failure.action === DECIDE_CASH_COLLECTION_STEP) {
      // The rule's own refusal (or an unknown order): passed on as it is.
      throw new MedusaError(failure.error?.type ?? MedusaError.Types.UNEXPECTED_STATE, cause)
    }
    if (failure.action === RECORD_CASH_COLLECTED_STEP) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `The payment is captured, but the slip reference could not be saved (${cause}). ` +
          "Reload the order and record the slip reference again; the payment will not be captured a second time."
      )
    }
    if (failure.action === acquireLockStepId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Another press is recording the cash for this order right now. Reload the order in a moment."
      )
    }
    // The capture failed: say whether another press got there first.
    const after = await loadCashCollection(req.scope, orderId)
    const message = captureFailureMessage(after.state, cause)
    const lostToAnotherPress =
      after.state.stage === "recorded" || after.state.stage === "captured_without_slip"
    throw new MedusaError(
      lostToAnotherPress ? MedusaError.Types.NOT_ALLOWED : MedusaError.Types.UNEXPECTED_STATE,
      message
    )
  }
  if (!result.recorded) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, refusalMessage("already_recorded"))
  }
  res.json(await describe(req.scope, orderId))
}
