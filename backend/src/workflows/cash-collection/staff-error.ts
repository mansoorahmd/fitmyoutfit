/**
 * Errors whose message is written for staff (the sentences in lib/rules/cash-collection.ts), so
 * the admin route may pass them on as they are. Any other error can carry SQL, a stack trace or an
 * internal id, and the route replaces it with a general sentence (QA's eighth review).
 */
import { MedusaError } from "@medusajs/framework/utils"

const STAFF_MESSAGE = Symbol.for("fitmyoutfit.cash-collection.staff-message")

/** A MedusaError whose message is written for staff, safe to pass on as it is. */
export function staffError(type: string, message: string): MedusaError {
  const error = new MedusaError(type, message)
  Object.defineProperty(error, STAFF_MESSAGE, { value: true })
  return error
}

/** True only for an error made by staffError. */
export function isStaffMessage(error: unknown): error is MedusaError {
  return (
    typeof error === "object" &&
    error !== null &&
    Boolean((error as Record<symbol, unknown>)[STAFF_MESSAGE])
  )
}
