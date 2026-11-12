/**
 * Cash on delivery collected, for staff in the admin (the order page's panel,
 * src/admin/widgets/cash-on-delivery-collected.tsx). Admin routes need a signed-in admin user;
 * Medusa checks that before these handlers run.
 *
 * GET  /admin/orders/:id/cash-collection
 *   The order's state (lib/rules/cash-collection.ts): whether it is paid by cash on delivery
 *   (`applies`; the panel shows only then), its `stage` (not_collected, partly_captured,
 *   captured_without_slip, recorded, unavailable), whether a slip reference may be recorded now
 *   and whether that captures (all or the rest of) the payment, the recorded slip reference and
 *   time (the order's cash-collection record, modules/cash-collection), and who captured and when
 *   (from Medusa's own capture record).
 *
 * POST /admin/orders/:id/cash-collection  { "slip_reference": "..." }
 *   Captures what is still open of the cash-on-delivery payment, then records the slip reference
 *   (workflows/cash-collection/mark-cash-collected.ts). Answers with the new state.
 *   Refused with HTTP 400: `invalid_data` for a missing or invalid reference, `not_allowed` when
 *   the order is not cash on delivery, already recorded or canceled, or when another press
 *   captured or recorded it at the same moment. HTTP 500 when the capture fails (nothing is
 *   recorded) or the record fails after the capture (the capture stays; record it again).
 *   An unknown or deleted order: 404.
 *
 * Every error message is a sentence for staff: never SQL, a stack trace or an internal id. An
 * error that is not one of ours is logged and answered with a general sentence.
 *
 * Thin: the rule is in lib/rules/cash-collection.ts.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  RECORDED_BUT_NOT_SHOWN_MESSAGE,
  STATE_READ_FAILURE_MESSAGE,
  UNEXPECTED_FAILURE_MESSAGE,
} from "../../../../../lib/rules/cash-collection"
import { loadCashCollection } from "../../../../../workflows/cash-collection/load-cash-collection"
import { markCashCollected } from "../../../../../workflows/cash-collection/mark-cash-collected"
import { isStaffMessage } from "../../../../../workflows/cash-collection/staff-error"

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

/**
 * Runs `fn`; an error that is not a sentence for staff is logged and replaced by `message`
 * (HTTP 500).
 */
async function forStaff<T>(
  container: MedusaContainer,
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isStaffMessage(error)) {
      throw error
    }
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`Cash collection failed: ${(error as Error)?.stack ?? error}`)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, message)
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  res.json(
    await forStaff(req.scope, STATE_READ_FAILURE_MESSAGE, () => describe(req.scope, req.params.id))
  )
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in as an admin user.")
  }
  const orderId = req.params.id
  const body = (req.body ?? {}) as { slip_reference?: unknown }
  await forStaff(req.scope, UNEXPECTED_FAILURE_MESSAGE, () =>
    markCashCollected(req.scope, {
      order_id: orderId,
      slip_reference: body.slip_reference,
      recorded_by: actorId,
    })
  )
  res.json(await forStaff(req.scope, RECORDED_BUT_NOT_SHOWN_MESSAGE, () => describe(req.scope, orderId)))
}
