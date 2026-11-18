// The account's addresses (docs/design/05-m1-pages.md, 9.5): the same
// fields, checks, messages and province lists as the checkout's address
// step (6.4), reused from checkout-address.ts and subdivisions.ts, never a
// second set of rules. A phone is required in every region (decision 008).
// Plain data in and out; the form only lays it out, and the server action
// runs the same checks before anything is saved.

import {
  AddressFields,
  AddressFormValues,
  AddressLike,
  CountryChoice,
  addressFields,
  addressLines,
  toCartAddress,
  validateAddressForm,
} from "./checkout-address"

type RegionLike = {
  countries?: { iso_2?: string | null; display_name?: string | null }[] | null
}

/**
 * The store's countries, in the order of its regions (Pakistan, United
 * Kingdom, United Arab Emirates, United States): the account's country
 * choice (05, 9.5, "Country"). Each country once.
 */
export const storeCountries = (regions: RegionLike[] | null | undefined): CountryChoice[] => {
  const seen = new Set<string>()
  const out: CountryChoice[] = []
  for (const region of regions ?? []) {
    for (const country of region.countries ?? []) {
      const code = country.iso_2?.toLowerCase()
      if (!code || seen.has(code)) continue
      seen.add(code)
      out.push({ code, name: country.display_name || code.toUpperCase() })
    }
  }
  return out
}

/** The store's country codes, for the checks. */
export const storeCountryCodes = (regions: RegionLike[] | null | undefined): string[] =>
  storeCountries(regions).map((c) => c.code)

export type AccountAddressValues = {
  address: AddressFields
  phone: string
  /** "Make this my default address" (W-U26). */
  isDefault: boolean
}

/** A field of the account's address form: an address field or the phone. */
export type AccountAddressKey = keyof AddressFields | "phone"

export type AccountAddressErrors = Partial<Record<AccountAddressKey, string>>

/** The fields in the order the form shows them, for focus and the error list. */
export const ACCOUNT_ADDRESS_FIELDS: AccountAddressKey[] = [
  "first_name",
  "last_name",
  "company",
  "country_code",
  "address_1",
  "address_2",
  "city",
  "province",
  "postal_code",
  "phone",
]

/**
 * Every message for the form, by field (empty when it can be saved): the
 * checkout's own check of a delivery address and its phone, with the
 * email left out (the account has one already). `countryCodes` are the
 * store's countries.
 */
export const validateAccountAddress = (
  values: AccountAddressValues,
  countryCodes: string[]
): AccountAddressErrors => {
  const asCheckout: AddressFormValues = {
    email: "",
    phone: values.phone,
    shipping: values.address,
    billingSame: true,
    billing: values.address,
    saveToAccount: false,
  }
  const found = validateAddressForm(asCheckout, countryCodes)
  const errors: AccountAddressErrors = {}
  for (const [key, message] of Object.entries(found)) {
    if (!message || key === "email") continue
    if (key === "phone") errors.phone = message
    else if (key.startsWith("shipping.")) {
      errors[key.slice("shipping.".length) as keyof AddressFields] = message
    }
  }
  return errors
}

/**
 * What Medusa receives (POST /store/customers/me/addresses and its update):
 * the checkout's trimmed address with the phone, and the default flag for
 * delivery and billing alike (one "default address" in the account).
 */
export const toCustomerAddress = (values: AccountAddressValues) => ({
  ...toCartAddress(values.address, values.phone),
  is_default_shipping: values.isDefault,
  is_default_billing: values.isDefault,
})

export type SavedAddress = AddressLike & {
  id: string
  is_default_shipping?: boolean | null
  created_at?: string | Date | null
}

/**
 * The form's first values: a saved address to edit, or a new one in the
 * visitor's country. A new address starts as the default when the
 * customer has none yet, so the first one saved is the one checkout offers
 * first.
 */
export const initialAccountAddress = ({
  saved,
  countryCode,
  hasDefault,
}: {
  saved?: SavedAddress | null
  countryCode: string
  hasDefault: boolean
}): AccountAddressValues => ({
  address: addressFields(saved, countryCode),
  phone: saved?.phone ?? "",
  isDefault: saved ? !!saved.is_default_shipping : !hasDefault,
})

/** When an address was added, as a number (0 when the store gave no date). */
const addedAt = (a: { created_at?: string | Date | null }): number =>
  new Date(a.created_at ?? 0).getTime() || 0

/**
 * An account that has addresses but none marked as the default (S1-11)
 * still has one: the most recently added. The same list, with that address
 * marked, so the cards, the overview and the form all agree.
 */
export const withEffectiveDefault = <T extends SavedAddress>(addresses: T[] | null | undefined): T[] => {
  const list = addresses ?? []
  if (list.length === 0 || list.some((a) => !!a.is_default_shipping)) return [...list]
  const newest = list.reduce((best, a) => (addedAt(a) > addedAt(best) ? a : best))
  return list.map((a) => (a === newest ? { ...a, is_default_shipping: true } : a))
}

/** The default address first (the most recently added when none is marked), then the others in the order they were saved. */
export const sortAddresses = <T extends SavedAddress>(addresses: T[] | null | undefined): T[] =>
  withEffectiveDefault(addresses).sort((a, b) => {
    const byDefault = Number(!!b.is_default_shipping) - Number(!!a.is_default_shipping)
    if (byDefault !== 0) return byDefault
    return String(a.created_at ?? "") < String(b.created_at ?? "") ? -1 : 1
  })

/**
 * Removing the default address while others remain (QA S1-4c, m5): the
 * most recently added of the others becomes the default, so the account
 * always has one and the overview's "Default address" is true. Null when
 * the removed address wasn't the default, another one already is, or none
 * remains.
 */
export const nextDefaultAfterRemoval = <T extends SavedAddress>(
  addresses: T[] | null | undefined,
  removedId: string
): T | null => {
  const list = addresses ?? []
  const removed = list.find((a) => a.id === removedId)
  if (!removed?.is_default_shipping) return null
  const rest = list.filter((a) => a.id !== removedId)
  if (rest.length === 0 || rest.some((a) => a.is_default_shipping)) return null
  const time = (a: T) => new Date(a.created_at ?? 0).getTime() || 0
  return rest.reduce((newest, a) => (time(a) > time(newest) ? a : newest))
}

/**
 * The address the overview shows under "Default address" (05, 9.2): the
 * default one, else the first saved (the one the checkout offers first),
 * else none.
 */
export const overviewAddress = <T extends SavedAddress>(addresses: T[] | null | undefined): T | null =>
  sortAddresses(addresses)[0] ?? null

export type AddressCardView = {
  id: string
  /** The name, shown inside <bdi>. */
  name: string
  /** The other lines (team or club, street, area, city, province, country). */
  lines: string[]
  phone: string | null
  isDefault: boolean
  /** The first address line, for "Edit address, 12 Mall Road". */
  firstLine: string
}

/** One saved address as the AddressCard shows it (05, 9.5). */
export const addressCardView = (
  address: SavedAddress,
  countryName: string | null | undefined
): AddressCardView => {
  const name = [address.first_name, address.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
  return {
    id: address.id,
    name,
    lines: addressLines({ ...address, first_name: "", last_name: "" }, countryName),
    phone: address.phone?.trim() || null,
    isDefault: !!address.is_default_shipping,
    firstLine: address.address_1?.trim() || name,
  }
}
