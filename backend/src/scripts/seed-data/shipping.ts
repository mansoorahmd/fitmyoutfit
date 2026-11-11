import type { PlaceholderData, ShippingSeed } from "./types"

/**
 * PLACEHOLDER DATA: where orders ship from, and one shipping option per region.
 * Real input: the hub's address (founders) and the real shipping and duty costs per market. The
 * export markets get one duty-paid (DDP) line, "Shipping & duties included", whose cost is inside
 * the product prices for now (amount 0); `ddp: true` is stored in the option's `data`, so the
 * storefront shows it as one line with no separate duties line.
 *
 * Amounts are in MAJOR units of the region's currency (250 = Rs 250), like prices.ts.
 * Each option is matched to its region by country code, and gets a service zone covering the
 * region's countries. The seed creates an option only for a region whose zone has none, so an
 * option renamed or re-priced in the admin is kept.
 */
export const shipping: PlaceholderData<ShippingSeed> = {
  placeholder: true,
  note: "Placeholder hub address and shipping amounts until the real costs and duty-paid quotes arrive.",
  data: {
    stock_location: {
      name: "Lahore hub",
      address: { address_1: "Placeholder address", city: "Lahore", country_code: "pk" },
    },
    fulfillment_set_name: "FitMyOutfit shipping",
    options: [
      {
        region_country_code: "pk",
        service_zone_name: "Pakistan",
        name: "Delivery in Pakistan",
        amount: 250,
        ddp: false,
        type: { code: "pk-delivery", label: "Delivery in Pakistan", description: "Courier delivery in Pakistan." },
      },
      {
        region_country_code: "gb",
        service_zone_name: "United Kingdom",
        name: "Shipping & duties included",
        amount: 0,
        ddp: true,
        type: { code: "ddp-gb", label: "Shipping & duties included", description: "One duty-paid box to the organizer." },
      },
      {
        region_country_code: "ae",
        service_zone_name: "United Arab Emirates",
        name: "Shipping & duties included",
        amount: 0,
        ddp: true,
        type: { code: "ddp-ae", label: "Shipping & duties included", description: "One duty-paid box to the organizer." },
      },
      {
        region_country_code: "us",
        service_zone_name: "United States",
        name: "Shipping & duties included",
        amount: 0,
        ddp: true,
        type: { code: "ddp-us", label: "Shipping & duties included", description: "One duty-paid box to the organizer." },
      },
    ],
  },
}
