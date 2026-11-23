/** The module's name in Medusa's container. */
export const DESIGN_REQUEST_MODULE = "designRequest"

/** The statuses of a request (lib/rules/design-request.ts), re-exported for the models. */
export { DESIGN_REQUEST_STATUSES, type DesignRequestStatus } from "../../lib/rules/design-request"

/** The kinds of email the module records. Only the confirmation exists yet. */
export const DESIGN_REQUEST_EMAIL_KINDS = ["received"] as const
export type DesignRequestEmailKind = (typeof DESIGN_REQUEST_EMAIL_KINDS)[number]
