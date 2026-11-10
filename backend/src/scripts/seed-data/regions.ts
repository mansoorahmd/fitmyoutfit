import type { PlaceholderData, RegionSeed } from "./types"

/**
 * PLACEHOLDER DATA: the four launch markets.
 * Real input: confirmed launch markets and countries (founders). Replace the content, not the logic.
 * `tax_final: false` is the data behind the "tax not final" label until the accountant's figures arrive.
 */
export const regions: PlaceholderData<RegionSeed[]> = {
  placeholder: true,
  note: "Launch markets from the Nov 2026 decisions. Replace when the market list changes.",
  data: [
    {
      name: "Pakistan",
      currency_code: "pkr",
      country_codes: ["pk"],
      metadata: { tax_final: false },
    },
    {
      name: "United Kingdom",
      currency_code: "gbp",
      country_codes: ["gb"],
      metadata: { tax_final: false },
    },
    {
      name: "United Arab Emirates",
      currency_code: "aed",
      country_codes: ["ae"],
      metadata: { tax_final: false },
    },
    {
      name: "United States",
      currency_code: "usd",
      country_codes: ["us"],
      metadata: { tax_final: false },
    },
  ],
}
