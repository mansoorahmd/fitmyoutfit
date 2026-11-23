import { Module } from "@medusajs/framework/utils"
import { DESIGN_REQUEST_MODULE } from "./constants"
import DesignRequestModuleService from "./service"

/**
 * The free design-help requests of teams, the record of their status changes and of the emails sent
 * (models/), in tables of their own. Registered in lib/config/build-config.ts; resolve it with
 * `container.resolve(DESIGN_REQUEST_MODULE)`.
 */
export default Module(DESIGN_REQUEST_MODULE, {
  service: DesignRequestModuleService,
})
