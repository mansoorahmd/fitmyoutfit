// The provinces, emirates and states the checkout offers (docs/design/
// 05-m1-pages.md, 6.4, field 10), by ISO 3166-2 code. These are place
// names, not wording.
//
// The address keeps the code in lower case ("pk-pb", "us-ca"), the form
// Medusa's tax regions use for a province, so a tax rate set per province
// later applies without rewriting addresses. Pages show the name.
//
// The codes are ISO 3166-2 (PK, AE, US), written from memory: to be checked
// against the ISO list before launch. The United Kingdom has no province
// field (05, 6.4).

export type Subdivision = { code: string; name: string }

const PK: Subdivision[] = [
  { code: "pk-pb", name: "Punjab" },
  { code: "pk-sd", name: "Sindh" },
  { code: "pk-kp", name: "Khyber Pakhtunkhwa" },
  { code: "pk-ba", name: "Balochistan" },
  { code: "pk-is", name: "Islamabad" },
  { code: "pk-gb", name: "Gilgit-Baltistan" },
  { code: "pk-jk", name: "Azad Jammu and Kashmir" },
]

const AE: Subdivision[] = [
  { code: "ae-az", name: "Abu Dhabi" },
  { code: "ae-du", name: "Dubai" },
  { code: "ae-sh", name: "Sharjah" },
  { code: "ae-aj", name: "Ajman" },
  { code: "ae-uq", name: "Umm Al Quwain" },
  { code: "ae-rk", name: "Ras Al Khaimah" },
  { code: "ae-fu", name: "Fujairah" },
]

const US_STATES: [string, string][] = [
  ["al", "Alabama"], ["ak", "Alaska"], ["az", "Arizona"], ["ar", "Arkansas"],
  ["ca", "California"], ["co", "Colorado"], ["ct", "Connecticut"], ["de", "Delaware"],
  ["dc", "District of Columbia"], ["fl", "Florida"], ["ga", "Georgia"], ["hi", "Hawaii"],
  ["id", "Idaho"], ["il", "Illinois"], ["in", "Indiana"], ["ia", "Iowa"],
  ["ks", "Kansas"], ["ky", "Kentucky"], ["la", "Louisiana"], ["me", "Maine"],
  ["md", "Maryland"], ["ma", "Massachusetts"], ["mi", "Michigan"], ["mn", "Minnesota"],
  ["ms", "Mississippi"], ["mo", "Missouri"], ["mt", "Montana"], ["ne", "Nebraska"],
  ["nv", "Nevada"], ["nh", "New Hampshire"], ["nj", "New Jersey"], ["nm", "New Mexico"],
  ["ny", "New York"], ["nc", "North Carolina"], ["nd", "North Dakota"], ["oh", "Ohio"],
  ["ok", "Oklahoma"], ["or", "Oregon"], ["pa", "Pennsylvania"], ["ri", "Rhode Island"],
  ["sc", "South Carolina"], ["sd", "South Dakota"], ["tn", "Tennessee"], ["tx", "Texas"],
  ["ut", "Utah"], ["vt", "Vermont"], ["va", "Virginia"], ["wa", "Washington"],
  ["wv", "West Virginia"], ["wi", "Wisconsin"], ["wy", "Wyoming"],
]

const US: Subdivision[] = US_STATES.map(([code, name]) => ({ code: `us-${code}`, name }))

const BY_COUNTRY: Record<string, Subdivision[]> = { pk: PK, ae: AE, us: US }

/** The list for a country, or an empty list when it has no province field. */
export const subdivisionsOf = (countryCode: string | null | undefined): Subdivision[] =>
  BY_COUNTRY[(countryCode ?? "").toLowerCase()] ?? []

/**
 * The name to show for a stored province: the list's name for a code we
 * know, else the value as it was stored (an address typed in the admin).
 */
export const subdivisionName = (
  countryCode: string | null | undefined,
  value: string | null | undefined
): string | null => {
  const stored = value?.trim()
  if (!stored) {
    return null
  }
  const known = subdivisionsOf(countryCode).find(
    (s) => s.code === stored.toLowerCase() || s.name.toLowerCase() === stored.toLowerCase()
  )
  return known?.name ?? stored
}

/** The stored code for a province given as a code or a name, or null when it isn't on the list. */
export const subdivisionCode = (
  countryCode: string | null | undefined,
  value: string | null | undefined
): string | null => {
  const given = value?.trim().toLowerCase()
  if (!given) {
    return null
  }
  return (
    subdivisionsOf(countryCode).find((s) => s.code === given || s.name.toLowerCase() === given)
      ?.code ?? null
  )
}
