import type { PlaceholderData, RegionSeed } from "./types"

/** Medusa's built-in payment provider: the placeholder payment until a real gateway is approved. */
const PLACEHOLDER_PAYMENT = "pp_system_default"
/** Cash on delivery (backend/src/modules/cod). Pakistan only. */
const CASH_ON_DELIVERY = "pp_cod_cod"

/**
 * PLACEHOLDER DATA: the four launch markets.
 * Real input: confirmed launch markets and countries (founders), and the minimum quantity per
 * market from the real duty-paid quotes. Replace the content, not the logic.
 * `tax_final: false` is the data behind the "tax not final" label until the accountant's figures
 * arrive. `min_garment_quantity` is the fewest garment pieces in one order; `addon_min_garment_quantity`
 * the fewest in a late joiner's add-on order (placeholder 1 in every region, for the founders).
 *
 * The seed writes a region's metadata keys only when they are missing, so after the first run the
 * values live in the database: change them in the admin (Settings > Regions > the region >
 * Metadata). It links the payment providers listed here that a region lacks, and keeps any other
 * provider an admin linked.
 */
export const regions: PlaceholderData<RegionSeed[]> = {
  placeholder: true,
  note: "Launch markets from the Nov 2026 decisions; minimum quantities are placeholders until the duty-paid quotes.",
  data: [
    {
      name: "Pakistan",
      currency_code: "pkr",
      country_codes: ["pk"],
      metadata: { tax_final: false, min_garment_quantity: 1, addon_min_garment_quantity: 1 },
      payment_providers: [PLACEHOLDER_PAYMENT, CASH_ON_DELIVERY],
    },
    {
      name: "United Kingdom",
      currency_code: "gbp",
      country_codes: ["gb"],
      metadata: { tax_final: false, min_garment_quantity: 10, addon_min_garment_quantity: 1 },
      payment_providers: [PLACEHOLDER_PAYMENT],
    },
    {
      name: "United Arab Emirates",
      currency_code: "aed",
      country_codes: ["ae"],
      metadata: { tax_final: false, min_garment_quantity: 10, addon_min_garment_quantity: 1 },
      payment_providers: [PLACEHOLDER_PAYMENT],
    },
    {
      name: "United States",
      currency_code: "usd",
      country_codes: ["us"],
      metadata: { tax_final: false, min_garment_quantity: 10, addon_min_garment_quantity: 1 },
      payment_providers: [PLACEHOLDER_PAYMENT],
    },
  ],
}
