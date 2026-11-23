import { Module } from "@medusajs/framework/utils"
import { FIT_KIT_REFUND_MODULE } from "./constants"
import FitKitRefundModuleService from "./service"

/**
 * The record of the fit kits staff refunded (models/fit-kit-refund.ts), in a table of its own.
 * Registered in lib/config/build-config.ts; resolve it with `container.resolve(FIT_KIT_REFUND_MODULE)`.
 */
export default Module(FIT_KIT_REFUND_MODULE, {
  service: FitKitRefundModuleService,
})
