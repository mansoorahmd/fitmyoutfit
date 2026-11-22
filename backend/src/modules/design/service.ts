import { MedusaService } from "@medusajs/framework/utils"
import { Design } from "./models/design"
import { DesignVersion } from "./models/design-version"

/**
 * Medusa's generated data service for designs and their versions. Thin on purpose: what a version
 * may hold is decided in lib/rules/design-input.ts, and who may see a design in the routes'
 * helpers (workflows/design/designs.ts).
 */
class DesignModuleService extends MedusaService({ Design, DesignVersion }) {}

export default DesignModuleService
