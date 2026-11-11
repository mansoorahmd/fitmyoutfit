/**
 * Records that the courier collected the cash for a cash-on-delivery order: captures the payment
 * through Medusa's own capturePaymentWorkflow (the one the admin's "Capture payment" button runs,
 * so the capture, the order transaction and the `payment.captured` event are Medusa's), then keeps
 * the courier's slip reference and the time in the order's metadata.
 *
 * Capture first, then write:
 * 1. the check (lib/rules/cash-collection.ts): cash on delivery, no slip recorded yet, the whole
 *    amount open (capture it) or already captured (record the slip only), a valid reference;
 * 2. the capture, only when the payment is still open. Medusa locks the payment's row while it
 *    captures and refuses a capture beyond the amount, so of several presses at once exactly one
 *    capture is made, on any number of server instances. A press whose capture fails stops here:
 *    it writes nothing and undoes nothing. (Medusa answers a capture of a payment that is already
 *    fully captured with success and makes no new capture, so a press that checked just before
 *    another press's capture went through can reach step 3 without having captured; step 3
 *    still lets only one press write);
 * 3. the reference, written only while the order has none (an atomic compare-and-set,
 *    ../order-metadata/write-order-metadata.ts). Of several presses exactly one writes; the
 *    others are told it is already recorded. Nothing is ever emptied again.
 *
 * If the write fails after the capture, the order is "captured without slip", and staff record
 * the reference again; it is not captured a second time.
 *
 * The lock around it (Medusa's locking module, in memory unless a provider is configured) only
 * makes a second press in the same process wait for the first; nothing depends on it.
 *
 * Thin: the rule is in lib/rules/cash-collection.ts, the loading in ./load-cash-collection.ts.
 */
import { MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  capturePaymentWorkflow,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import {
  cashCollectedMetadata,
  COD_SLIP_REFERENCE_KEY,
  decideCashCollection,
} from "../../lib/rules/cash-collection"
import { addOrderMetadataUnlessSet } from "../order-metadata/write-order-metadata"
import { loadCashCollection } from "./load-cash-collection"

export type MarkCashCollectedInput = {
  order_id: string
  /** As typed by staff; checked by the rule. */
  slip_reference: unknown
  /** The admin user (or secret API key) recording it; Medusa keeps it on the capture. */
  recorded_by: string
}

export type MarkCashCollectedResult = {
  order_id: string
  /** False when another press recorded a slip reference first. */
  recorded: boolean
}

/** Step ids, so the route can tell which step failed. */
export const DECIDE_CASH_COLLECTION_STEP = "decide-cash-collection"
export const RECORD_CASH_COLLECTED_STEP = "record-cash-collected"

/** Seconds a second press in the same process waits for the first one, and the lock's lifetime. */
const LOCK_WAIT_SECONDS = 15
const LOCK_TTL_SECONDS = 120

const decideCashCollectionStep = createStep(
  DECIDE_CASH_COLLECTION_STEP,
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
      capture_needed: decision.captureNeeded,
    })
  }
)

/** Writes the reference and the time while the order has no reference. No compensation. */
const recordCashCollectedStep = createStep(
  RECORD_CASH_COLLECTED_STEP,
  async (input: { order_id: string; slip_reference: string }, { container }) => {
    const recorded = await addOrderMetadataUnlessSet(
      container,
      input.order_id,
      COD_SLIP_REFERENCE_KEY,
      cashCollectedMetadata({ slipReference: input.slip_reference, collectedAt: new Date() })
    )
    return new StepResponse({ recorded })
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
    when({ decision }, ({ decision }) => decision.capture_needed).then(() => {
      const captureInput = transform({ decision, input }, ({ decision, input }) => ({
        payment_id: decision.payment_id,
        captured_by: input.recorded_by,
      }))
      capturePaymentWorkflow.runAsStep({ input: captureInput })
    })
    const record = recordCashCollectedStep({
      order_id: input.order_id,
      slip_reference: decision.slip_reference,
    })

    releaseLockStep({ key: lockKey })
    const result = transform({ input, record }, ({ input, record }): MarkCashCollectedResult => ({
      order_id: input.order_id,
      recorded: record.recorded,
    }))
    return new WorkflowResponse(result)
  }
)
