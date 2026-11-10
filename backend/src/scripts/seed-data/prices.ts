import type { PlaceholderData, PriceTableSeed } from "./types"

/**
 * PLACEHOLDER DATA: sample prices per unit, same price for every size, in MAJOR units
 * (3500 = Rs 3,500; 22 = GBP 22).
 * Real input: duty-paid (DDP) landed-cost prices per market, from the founders' real quotes.
 * Replace the numbers, not the logic. The fit kit price is a refundable deposit.
 * Only products with `has_fixed_prices: true` in products.ts have a row here. The rush add-on
 * has none: rush is a percentage of the order (`rush_percentage` in settings.ts).
 */
export const prices: PlaceholderData<PriceTableSeed> = {
  placeholder: true,
  note: "Sample price table. Not real prices: replace after the duty-paid quotes arrive.",
  data: {
    jersey: { pkr: 3500, gbp: 22, aed: 95, usd: 28 },
    "t-shirt": { pkr: 2000, gbp: 14, aed: 60, usd: 18 },
    jacket: { pkr: 7500, gbp: 45, aed: 190, usd: 55 },
    "fit-kit": { pkr: 5000, gbp: 30, aed: 130, usd: 40 },
  },
}
