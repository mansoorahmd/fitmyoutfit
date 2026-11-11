/**
 * Records that the courier collected the cash for a cash-on-delivery order: keeps the courier's
 * slip reference, who recorded it and when in the order's metadata, and captures the payment
 * through Medusa's own capturePaymentWorkflow (the same one the admin's "Capture" button runs, so
 * the capture, the order transaction and the `payment.captured` event are Medusa's).
 *
 * Order of the steps, so a failure leaves nothing half done:
 * 1. a lock on the order, so two presses at once cannot both pass the check;
 * 2. the check (lib/rules/cash-collection.ts): cash on delivery, not collected yet, a valid slip;
 * 3. the reference written into the order's metadata, with a compensation that empties it again;
 * 4. the capture. If it fails, step 3 is undone. A capture is never undone automatically (Medusa's
 *    own step has no compensation: the money is in), so it comes last.
 *
 * Thin: the rule is in lib/rules/cash-collection.ts, the loading in ./load-cash-collection.ts.
 */
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  capturePaymentWorkflow,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import {
  cashCollectedMetadata,
  COD_COLLECTED_AT_KEY,
  COD_COLLECTED_BY_KEY,
  COD_SLIP_REFERENCE_KEY,
  decideCashCollection,
} from "../../lib/rules/cash-collection"
import { loadCashCollection } from "./load-cash-collection"

export type MarkCashCollectedInput = {
  order_id: string
  /** As typed by staff; checked by the rule. */
  slip_reference: unknown
  /** The admin user who records it. */
  recorded_by: string
}

/** Seconds a second press waits for the first one before giving up, and the lock's lifetime. */
const LOCK_WAIT_SECONDS = 15
const LOCK_TTL_SECONDS = 120

const decideCashCollectionStep = createStep(
  "decide-cash-collection",
  async (input: { order_id: string; slip_reference: unknown }, { container }) => {
    const { state } = await loadCashCollection(container, input.order_id)
    const decision = decideCashCollection(state, input.slip_reference)
    if (!decision.ok) {
      throw new MedusaError(
        decision.reason === "invalid_reference"
          ? MedusaError.Types.INVALID_DATA
          : MedusaError.Types.NOT_ALLOWED,
        decision.message
      )
    }
    return new StepResponse({
      payment_id: decision.paymentId,
      slip_reference: decision.slipReference,
    })
  }
)

type Written = Record<string, string>

const recordCashCollectedStep = createStep(
  "record-cash-collected",
  async (
    input: { order_id: string; slip_reference: string; recorded_by: string },
    { container }
  ) => {
    const orderModule = container.resolve(Modules.ORDER)
    const order = await orderModule.retrieveOrder(input.order_id, { select: ["id", "metadata"] })
    const written: Written = cashCollectedMetadata({
      slipReference: input.slip_reference,
      collectedAt: new Date(),
      collectedBy: input.recorded_by,
    })
    await orderModule.updateOrders(input.order_id, {
      metadata: { ...(order.metadata ?? {}), ...written },
    })
    return new StepResponse(written, { order_id: input.order_id, written })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const orderModule = container.resolve(Modules.ORDER)
    const order = await orderModule.retrieveOrder(undo.order_id, { select: ["id", "metadata"] })
    const current = order.metadata ?? {}
    // Only undo this run's own write.
    const ours = Object.entries(undo.written).every(([key, value]) => current[key] === value)
    if (!ours) {
      return
    }
    // Medusa merges metadata on update, so the keys are emptied rather than removed.
    await orderModule.updateOrders(undo.order_id, {
      metadata: {
        ...current,
        [COD_SLIP_REFERENCE_KEY]: null,
        [COD_COLLECTED_AT_KEY]: null,
        [COD_COLLECTED_BY_KEY]: null,
      },
    })
  }
)

export const markCashCollectedWorkflow = createWorkflow(
  "mark-cash-collected",
  (input: MarkCashCollectedInput) => {
    const lockKey = transform({ input }, ({ input }) => `cash-collection:${input.order_id}`)
    acquireLockStep({ key: lockKey, timeout: LOCK_WAIT_SECONDS, ttl: LOCK_TTL_SECONDS })

    const decision = decideCashCollectionStep({
      order_id: input.order_id,
      slip_reference: input.slip_reference,
    })
    recordCashCollectedStep({
      order_id: input.order_id,
      slip_reference: decision.slip_reference,
      recorded_by: input.recorded_by,
    })
    const captureInput = transform({ decision, input }, ({ decision, input }) => ({
      payment_id: decision.payment_id,
      captured_by: input.recorded_by,
    }))
    capturePaymentWorkflow.runAsStep({ input: captureInput })

    releaseLockStep({ key: lockKey })
    return new WorkflowResponse({ order_id: input.order_id })
  }
)
