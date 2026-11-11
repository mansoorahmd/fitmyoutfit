/**
 * Cash on delivery collected, for staff in the admin (the order page's panel,
 * src/admin/widgets/cash-on-delivery-collected.tsx). Admin routes need a signed-in admin user;
 * Medusa checks that before these handlers run.
 *
 * GET  /admin/orders/:id/cash-collection
 *   The order's state: whether it is paid by cash on delivery (`applies`; the panel shows only
 *   then), whether the cash is collected, whether it may be recorded now, and the recorded slip
 *   reference, time and user.
 *
 * POST /admin/orders/:id/cash-collection  { "slip_reference": "..." }
 *   Records the cash as collected: captures the cash-on-delivery payment and keeps the slip
 *   reference on the order (workflows/cash-collection/mark-cash-collected.ts). Answers with the
 *   new state. Refused with HTTP 400: `invalid_data` for a missing or invalid reference,
 *   `not_allowed` when the order is not cash on delivery, already collected or canceled.
 *
 * Thin: the rule is in lib/rules/cash-collection.ts.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { loadCashCollection } from "../../../../../workflows/cash-collection/load-cash-collection"
import { markCashCollectedWorkflow } from "../../../../../workflows/cash-collection/mark-cash-collected"

/** The state, with the recording user's email for the panel. */
async function describe(container: MedusaContainer, orderId: string) {
  const { state } = await loadCashCollection(container, orderId)
  let collectedByEmail: string | null = null
  if (state.collected_by) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "user",
      fields: ["email"],
      filters: { id: state.collected_by },
    })
    collectedByEmail = (data as unknown as { email?: string }[])[0]?.email ?? null
  }
  return {
    cash_collection: {
      applies: state.applies,
      collected: state.collected,
      can_collect: state.can_collect,
      reason: state.reason,
      slip_reference: state.slip_reference,
      collected_at: state.collected_at,
      collected_by: state.collected_by,
      collected_by_email: collectedByEmail,
    },
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  res.json(await describe(req.scope, req.params.id))
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in as an admin user.")
  }
  const body = (req.body ?? {}) as { slip_reference?: unknown }
  await markCashCollectedWorkflow(req.scope).run({
    input: { order_id: req.params.id, slip_reference: body.slip_reference, recorded_by: actorId },
  })
  res.json(await describe(req.scope, req.params.id))
}
