import type { PlaceholderData, StoreSettingsSeed } from "./types"

/**
 * PLACEHOLDER DATA: store-wide settings, stored in the Store's metadata.
 * Real input: the founders' rush percentage, cash-on-delivery limit and delivery promise.
 * The minimum quantity is per region, in regions.ts.
 *
 * The seed writes a setting only when the Store's metadata does not have it yet. After that, the
 * value lives in the database: change it in the admin (Settings > Store > Metadata), not here.
 */
export const settings: PlaceholderData<StoreSettingsSeed> = {
  placeholder: true,
  note: "Placeholder rush percentage, cash-on-delivery limit, delivery days, roster limits, time zone and the team order payment page until the founders confirm them. The 50% deposit is the founders' decision (CLAUDE.md).",
  data: {
    rush_percentage: 20,
    // Largest cart total, in PKR (major units: 20000 = Rs 20,000), payable by cash on delivery.
    cod_max_total: 20000,
    // Calendar days from proof approval to delivery, standard and with paid rush.
    delivery_days_standard: 15,
    delivery_days_rush: 10,
    // Team lists (decision 012): most lines in a list, most of one shirt on a line, longest name.
    roster_max_lines: 100,
    roster_max_count: 10,
    roster_max_name_length: 18,
    // The time zone of the store's day: "today" for a team order's need-by arithmetic.
    schedule_time_zone: "Asia/Karachi",
    team_order_deposit_percentage: 50,
    team_order_payment_path: "/[countryCode]/account/team-orders/[id]/pay",
    // Days after an order within which a fit kit may come back and be refunded; 0 = no limit (not settled).
    fit_kit_return_days: 0,
  },
}
