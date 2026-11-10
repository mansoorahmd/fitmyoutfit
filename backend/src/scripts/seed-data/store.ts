import type { PlaceholderData, StoreSeed } from "./types"

/**
 * PLACEHOLDER DATA: store-level settings.
 * Real input: none expected, but currencies follow the regions file.
 */
export const store: PlaceholderData<StoreSeed> = {
  placeholder: true,
  note: "Supported currencies follow the launch markets. PKR is the default (first market).",
  data: {
    supported_currencies: ["pkr", "gbp", "aed", "usd"],
    default_currency_code: "pkr",
    default_sales_channel_name: "Default Sales Channel",
    publishable_key_title: "Storefront",
  },
}
