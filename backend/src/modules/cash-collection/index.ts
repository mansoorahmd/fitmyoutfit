import { Module } from "@medusajs/framework/utils"
import { CASH_COLLECTION_MODULE } from "./constants"
import CashCollectionModuleService from "./service"

/**
 * The cash-collection record of an order (models/cash-collection.ts), in a table of its own.
 * Registered in lib/config/build-config.ts; resolve it with `container.resolve(CASH_COLLECTION_MODULE)`.
 */
export default Module(CASH_COLLECTION_MODULE, {
  service: CashCollectionModuleService,
})
