import { MedusaService } from "@medusajs/framework/utils"
import { CashCollection } from "./models/cash-collection"

/**
 * Medusa's generated data service for the cash-collection record (create, list, retrieve...).
 * Thin on purpose: when a record may be made is decided in lib/rules/cash-collection.ts, and the
 * steps are in workflows/cash-collection/.
 */
class CashCollectionModuleService extends MedusaService({ CashCollection }) {}

export default CashCollectionModuleService
