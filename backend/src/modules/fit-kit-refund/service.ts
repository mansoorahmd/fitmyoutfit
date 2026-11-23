import { MedusaService } from "@medusajs/framework/utils"
import { FitKitRefund } from "./models/fit-kit-refund"

/**
 * Medusa's generated data service for the record of fit kit returns. Thin on purpose: what may be
 * refunded is decided in lib/rules/fit-kit-refund.ts, the steps are in workflows/fit-kit/.
 */
class FitKitRefundModuleService extends MedusaService({ FitKitRefund }) {}

export default FitKitRefundModuleService
