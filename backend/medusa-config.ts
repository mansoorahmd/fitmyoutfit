import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { buildMedusaConfig } from "./src/lib/config/build-config"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// All logic, including the refusal of dev-only secrets in production, is in build-config.ts.
module.exports = defineConfig(buildMedusaConfig(process.env))
