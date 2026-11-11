import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

/**
 * Fraction digits we pin per currency, so the server and the browser agree
 * whatever ICU data they ship. Without this, PKR is whole rupees in current
 * ICU data but "PKR 3,500.00" in older data, which would cause hydration
 * mismatches in client components. Other currencies use the Intl default
 * (2 decimals for GBP, AED and USD).
 */
const CURRENCY_FRACTION_DIGITS: Record<string, { min: number; max: number }> = {
  // Whole rupees, but keep paisa if a price ever has them. Never round a price.
  pkr: { min: 0, max: 2 },
}

/**
 * Every amount in the store, on every page: the currency code, then the
 * number ("PKR 3,500", "GBP 22.00", "AED 95.00", "USD 28.00"). One format
 * for all four regions, and no "$" that could be read as another dollar
 * (decision 008, 1). Intl puts a no-break space after the code, so the code
 * never ends a line on its own.
 */
export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
}: ConvertToLocaleParams) => {
  if (!currency_code || isEmpty(currency_code)) {
    return amount.toString()
  }

  const pinned = CURRENCY_FRACTION_DIGITS[currency_code.toLowerCase()]

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency_code,
    currencyDisplay: "code",
    minimumFractionDigits: minimumFractionDigits ?? pinned?.min,
    maximumFractionDigits: maximumFractionDigits ?? pinned?.max,
  }).format(amount)
}
