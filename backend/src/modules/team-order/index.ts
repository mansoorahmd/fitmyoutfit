import { Module } from "@medusajs/framework/utils"
import { TEAM_ORDER_MODULE } from "./constants"
import TeamOrderModuleService from "./service"

/**
 * Team orders and their team lists (models/), in tables of their own.
 * Registered in lib/config/build-config.ts; resolve it with `container.resolve(TEAM_ORDER_MODULE)`.
 */
export default Module(TEAM_ORDER_MODULE, {
  service: TeamOrderModuleService,
})
