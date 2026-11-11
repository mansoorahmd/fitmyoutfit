"use client"

import { clx } from "@medusajs/ui"
import { useParams } from "next/navigation"
import { useState } from "react"

import { accountContent } from "@content/account"
import { signout } from "@lib/data/customer"
import { ACCOUNT_MENU, AccountPage } from "@lib/util/account-rows"
import Spinner from "@modules/common/icons/spinner"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import { loadPage } from "../../load-page"
import AccountIcon from "../account-icon"

const words = accountContent.frame.menu

const FOCUS =
  "focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"

/**
 * The account menu (docs/design/05-m1-pages.md, 9.1): Orders, Addresses,
 * Profile and "Sign out", each a 48 px row with its 20 px icon.
 * - `rows` (phones, at the end of the overview): full-width rows with a
 *   chevron at the end.
 * - `side` (from 1024 px, the left column): a vertical list; the current
 *   page has a 3 px `ink` bar on the start edge, semibold words and
 *   `aria-current="page"`.
 * Sign out has no confirm step; it shows "Signing out…" while it works.
 */
const AccountMenu = ({ current, variant }: { current: AccountPage; variant: "rows" | "side" }) => {
  const { countryCode } = useParams() as { countryCode: string }
  // stays true until the sign-in page replaces this one
  const [signingOut, setSigningOut] = useState(false)

  const signOut = () => {
    if (signingOut) return
    setSigningOut(true)
    signout(countryCode)
      .then(({ href }) => loadPage(href))
      // no answer: reload the account, which shows what the cookie now says
      .catch(() => loadPage(`/${countryCode}/account`))
  }
  const rows = variant === "rows"

  const rowClass = (active: boolean) =>
    clx(
      "flex min-h-[48px] w-full items-center gap-3 type-body text-brand-ink",
      FOCUS,
      rows
        ? "border-b border-brand-border px-1"
        : clx(
            "border-s-[3px] ps-3 pe-2",
            active ? "border-brand-ink font-semibold" : "border-transparent hover:border-brand-border-strong"
          )
    )

  return (
    <nav aria-label={words.label} data-testid={`account-menu-${variant}`}>
      <ul className={clx("flex flex-col", rows && "border-t border-brand-border")}>
        {ACCOUNT_MENU.map((item) => {
          const active = item.page === current
          return (
            <li key={item.page}>
              <LocalizedClientLink
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={rowClass(active)}
                data-testid={`account-menu-${item.page}`}
              >
                <AccountIcon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {rows && <AccountIcon name="chevron" className="h-5 w-5 shrink-0 rtl:-scale-x-100" />}
              </LocalizedClientLink>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={signOut}
            aria-disabled={signingOut || undefined}
            aria-busy={signingOut || undefined}
            className={clx(rowClass(false), "text-start")}
            data-testid="account-sign-out"
          >
            {signingOut ? (
              <Spinner size={20} aria-hidden="true" />
            ) : (
              <AccountIcon name="sign-out" className="h-5 w-5 shrink-0" />
            )}
            <span className="min-w-0 flex-1">{signingOut ? words.signingOut : words.signOut}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

export default AccountMenu
