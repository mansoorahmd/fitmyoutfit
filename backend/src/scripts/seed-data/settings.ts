import type { PlaceholderData, StoreSettingsSeed } from "./types"

/**
 * PLACEHOLDER DATA: store-wide settings, stored in the Store's metadata.
 * Real input: the founders' rush percentage. Sprint 1 adds more settings here (cash-on-delivery
 * limit, minimum quantities).
 *
 * The seed writes a setting only when the Store's metadata does not have it yet. After that, the
 * value lives in the database: change it in the admin (Settings > Store > Metadata), not here.
 */
export const settings: PlaceholderData<StoreSettingsSeed> = {
  placeholder: true,
  note: "Placeholder rush percentage until the founders confirm it.",
  data: {
    rush_percentage: 20,
  },
}
