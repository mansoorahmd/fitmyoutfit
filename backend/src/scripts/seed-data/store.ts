import type { PlaceholderData, StoreSeed } from "./types"

/**
 * PLACEHOLDER DATA: store-level settings.
 * Real input: the final store name (founders); currencies follow the regions file.
 */
export const store: PlaceholderData<StoreSeed> = {
  placeholder: true,
  note: "Store name for now (it may change). Supported currencies are exactly the launch markets' four; PKR is the default (first market).",
  data: {
    name: "FitMyOutfit",
    supported_currencies: ["pkr", "gbp", "aed", "usd"],
    default_currency_code: "pkr",
    default_sales_channel_name: "Default Sales Channel",
    publishable_key_title: "Storefront",
  },
}
