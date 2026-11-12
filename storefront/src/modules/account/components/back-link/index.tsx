import LocalizedClientLink from "@modules/common/components/localized-client-link"

import AccountIcon from "../account-icon"

/**
 * "‹ Your account" and "‹ Your orders" (docs/design/05-m1-pages.md, 9.1
 * and 9.4, W-U1 and W-U21): a text link, 44 px tall, above the page's
 * title. The "‹" is a decorative chevron, so screen readers read the words.
 */
const BackLink = ({ href, label, "data-testid": dataTestId }: { href: string; label: string; "data-testid"?: string }) => (
  <LocalizedClientLink
    href={href}
    className="inline-flex min-h-[44px] items-center gap-1 self-start pe-2 type-body font-semibold text-brand-ink underline-offset-4 hover:underline focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
    data-testid={dataTestId ?? "account-back"}
  >
    <AccountIcon name="chevron" className="h-5 w-5 shrink-0 -scale-x-100 rtl:scale-x-100" />
    <span>{label}</span>
  </LocalizedClientLink>
)

export default BackLink
