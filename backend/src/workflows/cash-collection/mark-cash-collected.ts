/**
 * Records that the courier collected the cash for a cash-on-delivery order, in two separate
 * steps, each finished before the next starts:
 *
 * 1. The check (lib/rules/cash-collection.ts): cash on delivery, no record yet, a valid
 *    reference, and what to capture: the whole amount, what is still open after a part was
 *    captured in Medusa's own payment section, or nothing when it is fully captured already.
 * 2. The capture, when needed, as its own run of Medusa's capturePaymentWorkflow (the one the
 *    admin's "Capture payment" button runs, so the capture, the order's payment transaction and
 *    the `payment.captured` event are Medusa's). Medusa locks the payment's row while it captures
 *    and refuses a capture beyond the amount, so of several presses at once exactly one capture is
 *    made, on any number of server instances. (A capture asked for on a payment that is already
 *    fully captured succeeds without a new capture, so a press that checked just before another
 *    press's capture went through still reaches step 3.) A press whose capture fails stops here.
 * 3. The record: one insert into our own table (modules/cash-collection), which allows one record
 *    per order. Of several presses exactly one inserts; the others are told it is already
 *    recorded. If the insert fails, the capture of step 2 is a finished run and stays exactly as
 *    Medusa left it (payment, capture and the order's payment transaction): the order is then
 *    "captured without slip", and staff record the reference again without a second capture.
 *
 * Not a Medusa workflow on purpose: a workflow would undo the capture's order transaction when
 * the record fails, while the capture itself stays (QA's eighth review, N1).
 *
 * Errors carry a sentence for staff (lib/rules/cash-collection.ts), never SQL, a stack trace or
 * an internal id; the underlying error is logged. The admin route passes on only errors made here
 * (isStaffMessage) and replaces any other with a general sentence.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import {
  captureFailureMessage,
  decideCashCollection,
  RECORD_FAILURE_MESSAGE,
  refusalMessage,
} from "../../lib/rules/cash-collection"
import { CASH_COLLECTION_MODULE } from "../../modules/cash-collection/constants"
import type CashCollectionModuleService from "../../modules/cash-collection/service"
import { loadCashCollection, readCashCollectionRecord } from "./load-cash-collection"
import { staffError } from "./staff-error"

export type MarkCashCollectedInput = {
  order_id: string
  /** As typed by staff; checked by the rule. */
  slip_reference: unknown
  /** The admin user (or secret API key) recording it; Medusa keeps it on the capture. */
  recorded_by: string
}

function logFailure(container: MedusaContainer, what: string, orderId: string, error: unknown) {
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .error(`Cash collection, order ${orderId}: ${what}: ${(error as Error)?.message ?? error}`)
}

/** Captures, records, and returns nothing: the caller reads the new state. Throws staffError. */
export async function markCashCollected(
  container: MedusaContainer,
  input: MarkCashCollectedInput
): Promise<void> {
  const orderId = input.order_id

  // 1. The check.
  const loaded = await loadCashCollection(container, orderId)
  const decision = decideCashCollection(loaded.state, input.slip_reference)
  if (!decision.ok) {
    throw staffError(
      decision.reason === "invalid_reference"
        ? MedusaError.Types.INVALID_DATA
        : MedusaError.Types.NOT_ALLOWED,
      decision.message
    )
  }

  // 2. The capture, as its own finished run.
  if (decision.capture !== "none") {
    const amount = decision.capture === "remainder" ? loaded.remainingOf(decision.paymentId) : undefined
    const { errors } = await capturePaymentWorkflow(container).run({
      input: {
        payment_id: decision.paymentId,
        captured_by: input.recorded_by,
        ...(amount === undefined ? {} : { amount }),
      },
      throwOnError: false,
    })
    if (errors?.length) {
      logFailure(container, "the capture failed", orderId, errors[0]?.error)
      const after = await loadCashCollection(container, orderId)
      const lostToAnotherPress =
        after.state.stage === "recorded" || after.state.stage === "captured_without_slip"
      throw staffError(
        lostToAnotherPress ? MedusaError.Types.NOT_ALLOWED : MedusaError.Types.UNEXPECTED_STATE,
        captureFailureMessage(after.state)
      )
    }
  }

  // 3. The record: one row per order, guaranteed by the database.
  const service = container.resolve<CashCollectionModuleService>(CASH_COLLECTION_MODULE)
  try {
    await service.createCashCollections({
      order_id: orderId,
      slip_reference: decision.slipReference,
      collected_at: new Date(),
    })
  } catch (error) {
    if (await readCashCollectionRecord(container, orderId).catch(() => null)) {
      // Another press recorded it first (the unique index refused this one).
      throw staffError(MedusaError.Types.NOT_ALLOWED, refusalMessage("already_recorded"))
    }
    logFailure(container, "the payment is captured but the record could not be saved", orderId, error)
    throw staffError(MedusaError.Types.UNEXPECTED_STATE, RECORD_FAILURE_MESSAGE)
  }
}
