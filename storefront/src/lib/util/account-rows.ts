// Which rows and menu items the account shows (docs/design/05-m1-pages.md,
// 9.1 and 9.6), and what each row says. Plain data; the pages lay it out.

import { accountContent } from "@content/account"

import type { AccountIconName } from "@modules/account/components/account-icon"

const words = accountContent

export type AccountPage = "overview" | "orders" | "addresses" | "profile"

export type MenuItem = {
  page: Exclude<AccountPage, "overview">
  label: string
  /** A path without the country code. */
  href: string
  icon: AccountIconName
}

/** The menu (05, 9.1): Orders, Addresses, Profile; "Sign out" is a button after them. */
export const ACCOUNT_MENU: MenuItem[] = [
  { page: "orders", label: words.frame.menu.orders, href: "/account/orders", icon: "orders" },
  { page: "addresses", label: words.frame.menu.addresses, href: "/account/addresses", icon: "pin" },
  { page: "profile", label: words.frame.menu.profile, href: "/account/profile", icon: "user" },
]

/** The page the "‹ Your account" link sits on: every page but the overview (05, 9.1). */
export const showsBackLink = (page: AccountPage): boolean => page !== "overview"

/** The title band ("Your account", "Hello, …", the email) heads the overview only; inner pages have their own h1. */
export const showsTitleBand = (page: AccountPage): boolean => page === "overview"

/**
 * Whether the store can change a password while signed in. Medusa 2.22's
 * POST /auth/customer/emailpass/update accepts only a token from its
 * reset-password flow (an email), never a signed-in token or the current
 * password (checked against the backend: HTTP 401 "Invalid token"). So the
 * password row stays out until password reset exists (a later task).
 */
export const PASSWORD_CHANGE_AVAILABLE = false

export type ProfileRowKey = "name" | "phone" | "email" | "password"

export type ProfileRow = {
  key: ProfileRowKey
  label: string
  /** The value shown, or the "Not given" words. */
  value: string
  /** Shown as given (`dir="auto"` for a name); the phone and email left to right. */
  direction: "auto" | "ltr"
  /** Has an "Edit" button. The email is read-only in M1 (05, 9.6). */
  editable: boolean
  /** True when there is no value yet ("Not given" in muted text). */
  empty: boolean
}

type CustomerLike = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

const join = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join(" ")

/**
 * The profile's rows (05, 9.6), in order: Name (editable), Phone
 * (editable), Email (read-only: changing it is not wired in M1), and
 * Password only when it can be changed (PASSWORD_CHANGE_AVAILABLE). The
 * starter's billing address is removed: addresses live on their own page.
 */
export const profileRows = (
  customer: CustomerLike,
  { passwordChange = PASSWORD_CHANGE_AVAILABLE }: { passwordChange?: boolean } = {}
): ProfileRow[] => {
  const p = words.profile
  const row = (
    key: ProfileRowKey,
    raw: string,
    direction: ProfileRow["direction"],
    editable: boolean
  ): ProfileRow => ({
    key,
    label: p.rows[key as keyof typeof p.rows] ?? key,
    value: raw || p.notGiven,
    direction,
    editable,
    empty: !raw,
  })
  const rows = [
    row("name", join(customer.first_name, customer.last_name), "auto", true),
    row("phone", customer.phone?.trim() ?? "", "ltr", true),
    row("email", customer.email?.trim() ?? "", "ltr", false),
  ]
  if (passwordChange) {
    rows.push(row("password", "", "ltr", true))
  }
  return rows
}

/** "Hello, محمد علی" needs the first name; with none, "Hello" alone. */
export const greetingName = (customer: CustomerLike | null | undefined): string | null =>
  customer?.first_name?.trim() || null
