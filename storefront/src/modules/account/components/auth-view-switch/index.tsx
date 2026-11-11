import { clx } from "@medusajs/ui"

import { accountContent } from "@content/account"
import { AuthView, authHref } from "@lib/util/account-auth"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const words = accountContent.auth.tabs

/**
 * "Sign in" | "Create account" under the title (docs/design/05-m1-pages.md,
 * 8.3, item 2). Links, not ARIA tabs: each view has its own URL, so Back
 * and shared links work. Each is 44 px tall; the current one has a 3 px
 * `ink` underline and `aria-current="page"`. Where to return to and the
 * email go along with the switch.
 */
const AuthViewSwitch = ({
  view,
  next,
  email,
}: {
  view: AuthView
  next?: string | null
  email?: string | null
}) => {
  const items: { view: AuthView; label: string }[] = [
    { view: "signin", label: words.signIn },
    { view: "create", label: words.create },
  ]
  return (
    <nav aria-label={words.label} data-testid="auth-view-switch">
      <ul className="flex gap-6 border-b border-brand-border">
        {items.map((item) => {
          const current = item.view === view
          return (
            <li key={item.view}>
              <LocalizedClientLink
                href={authHref(item.view, { next, email })}
                aria-current={current ? "page" : undefined}
                className={clx(
                  "-mb-px flex min-h-[44px] items-center border-b-[3px] type-body",
                  "focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                  current
                    ? "border-brand-ink font-semibold text-brand-ink"
                    : "border-transparent text-brand-ink-muted hover:text-brand-ink"
                )}
                data-testid={`auth-view-${item.view}`}
              >
                {item.label}
              </LocalizedClientLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default AuthViewSwitch
