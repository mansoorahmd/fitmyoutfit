import type { ExecArgs } from "@medusajs/framework/types"
import { seedStore } from "./seed-lib/seed-store"

/**
 * Entry point for `npm run seed` (`medusa exec ./src/scripts/seed.ts`).
 * Safe to run more than once: it only creates what is missing.
 * Prints one machine-readable line with the publishable key, which the root setup script
 * copies into storefront/.env.local.
 */
export default async function seed({ container }: ExecArgs) {
  const result = await seedStore(container, {
    adminEmail: process.env.MEDUSA_ADMIN_EMAIL,
    adminPassword: process.env.MEDUSA_ADMIN_PASSWORD,
    // The dev admin user is created only in development and test (see node-env.ts).
    nodeEnv: process.env.NODE_ENV,
  })
  console.log(`FITMYOUTFIT_PUBLISHABLE_KEY=${result.publishableKey}`)
}
