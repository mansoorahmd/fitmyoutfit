import { HttpTypes } from "@medusajs/types"

/** One country the visitor can shop from, with its region's currency. */
export type RegionChoice = {
  /** ISO 3166-1 alpha-2, lower case, as used in the URL ("pk"). */
  countryCode: string
  countryName: string
  /** ISO 4217, upper case ("PKR"). */
  currencyCode: string
}

/** Every country of every region, sorted by country name. */
export const toRegionChoices = (
  regions: HttpTypes.StoreRegion[] | null | undefined
): RegionChoice[] =>
  (regions ?? [])
    .flatMap((region) =>
      (region.countries ?? []).map((country) => ({
        countryCode: (country.iso_2 ?? "").toLowerCase(),
        countryName: country.display_name ?? country.name ?? "",
        currencyCode: (region.currency_code ?? "").toUpperCase(),
      }))
    )
    .filter((choice) => choice.countryCode)
    .sort((a, b) => a.countryName.localeCompare(b.countryName))

export const findRegionChoice = (
  choices: RegionChoice[],
  countryCode: string | undefined
): RegionChoice | undefined =>
  choices.find((choice) => choice.countryCode === countryCode?.toLowerCase())

/** The header chip's text: "PK · PKR". */
export const regionChipLabel = (choice: RegionChoice): string =>
  `${choice.countryCode.toUpperCase()} · ${choice.currencyCode}`

/**
 * The current page's path without its country code, so a new region can be
 * put in front of it: "/pk/products/jersey" gives "/products/jersey", and
 * "/pk" gives "" (the home page).
 */
export const pathWithoutCountry = (
  pathname: string,
  countryCode: string
): string => {
  const prefix = `/${countryCode}`
  if (pathname === prefix) {
    return ""
  }
  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length)
  }
  return pathname
}
