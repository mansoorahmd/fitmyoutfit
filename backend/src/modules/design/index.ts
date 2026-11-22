import { Module } from "@medusajs/framework/utils"
import { DESIGN_MODULE } from "./constants"
import DesignModuleService from "./service"

/**
 * Saved designs and their versions (models/), in tables of their own.
 * Registered in lib/config/build-config.ts; resolve it with `container.resolve(DESIGN_MODULE)`.
 */
export default Module(DESIGN_MODULE, {
  service: DesignModuleService,
})
