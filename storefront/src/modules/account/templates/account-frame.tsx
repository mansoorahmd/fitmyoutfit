import { HttpTypes } from "@medusajs/types"
import { Fragment } from "react"

import { accountContent } from "@content/account"
import { AccountPage, greetingName, showsBackLink, showsTitleBand } from "@lib/util/account-rows"
import { fillParts } from "@lib/util/wording"

import AccountMenu from "../components/account-menu"
import BackLink from "../components/back-link"

const words = accountContent.frame

/**
 * The account's frame (docs/design/05-m1-pages.md, 9.1):
 * - 360 px: the overview has the title band, its content, then the menu as
 *   a list; an inner page has "‹ Your account" above its own title.
 * - 768 px: the same, at most 640 px wide.
 * - From 1024 px: the menu in a sticky 240 px left column, the page on the
 *   right.
 * No "Got questions?" block and no profile completion figure (9.1, Remove).
 */
const AccountFrame = ({
  page,
  customer,
  back,
  children,
}: {
  page: AccountPage
  customer: HttpTypes.StoreCustomer
  /** The link above the title on inner pages: "‹ Your account" unless given ("‹ Your orders"). */
  back?: { href: string; label: string; testId?: string }
  children: React.ReactNode
}) => {
  const name = greetingName(customer)
  return (
    <div className="content-container pb-12 pt-6 md:pt-8 xl:pb-24" data-testid="account-page" data-page={page}>
      <div className="mx-auto flex max-w-[640px] flex-col lg:grid lg:max-w-none lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-12">
        <aside className="hidden lg:sticky lg:top-20 lg:block xl:top-[88px]">
          <AccountMenu current={page} variant="side" />
        </aside>
        <div className="flex min-w-0 flex-col gap-8">
          {showsBackLink(page) && (
            <BackLink
              href={back?.href ?? "/account"}
              label={back?.label ?? words.back}
              data-testid={back?.testId}
            />
          )}
          {showsTitleBand(page) && (
            <header className="flex flex-col gap-1" data-testid="account-title-band">
              <h1 className="type-h1 text-brand-ink">{words.title}</h1>
              <p className="type-body-lg text-brand-ink" data-testid="account-hello">
                {name
                  ? fillParts(words.hello, { name: <bdi>{name}</bdi> }).map((part, i) => (
                      <Fragment key={i}>{part}</Fragment>
                    ))
                  : words.helloNoName}
              </p>
              <p dir="ltr" className="text-start type-small break-all text-brand-ink-muted" data-testid="account-email">
                {customer.email}
              </p>
            </header>
          )}
          {children}
          {page === "overview" && (
            <div className="lg:hidden">
              <AccountMenu current={page} variant="rows" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AccountFrame
