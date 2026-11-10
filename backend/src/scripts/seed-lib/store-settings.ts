/**
 * Which store settings the seed still has to write into the Store's metadata. Plain TypeScript,
 * no Medusa imports.
 */
import type { StoreSettingsSeed } from "../seed-data/types"

/**
 * The settings from the seed data that the metadata does not have yet. A key that is present
 * keeps its value, whatever it is: an admin may have changed it, and the seed never overwrites.
 */
export function missingStoreSettings(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  defaults: StoreSettingsSeed
): Record<string, unknown> {
  const missing: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaults)) {
    const current = metadata?.[key]
    if (current === undefined || current === null) {
      missing[key] = value
    }
  }
  return missing
}
