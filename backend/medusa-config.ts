import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { buildHttpConfig, buildModules } from "./src/lib/config/build-config"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL || undefined,
    http: buildHttpConfig(process.env),
  },
  modules: buildModules(process.env),
})
