import { MedusaService } from "@medusajs/framework/utils"
import { Design } from "./models/design"
import { DesignVersion } from "./models/design-version"
import { protectStatementValues } from "../../lib/rules/statement-privacy"

/**
 * Medusa's generated data service for designs and their versions. Thin on purpose: what a version
 * may hold is decided in lib/rules/design-input.ts, and who may see a design in the routes'
 * helpers (workflows/design/designs.ts).
 */
class DesignModuleService extends MedusaService({ Design, DesignVersion }) {}

// A failed statement's error carries no values outside development and tests (lib/rules/statement-privacy.ts).
protectStatementValues(DesignModuleService)

export default DesignModuleService
