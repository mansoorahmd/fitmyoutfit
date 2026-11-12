import { accountContent } from "@content/account"
import { AuthView } from "@lib/util/account-auth"

import AuthForm from "../components/auth-form"
import AuthViewSwitch from "../components/auth-view-switch"

const words = accountContent.auth

/**
 * Sign-in and create account on one route (docs/design/05-m1-pages.md,
 * section 8): `?view=signin` (the default) or `?view=create`.
 * - 360 px: one column, 32 px under the header, the form full width.
 * - 768 px: centred, at most 440 px wide.
 * - From 1280 px: the same inside a box, with 64 px above and below.
 * Each view keeps its own form state (keyed by the view).
 */
const AuthTemplate = ({
  view,
  next,
  email,
}: {
  view: AuthView
  next: string | null
  email: string
}) => (
  <div className="content-container pb-12 pt-8 xl:py-16" data-testid="auth-page">
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6 xl:rounded-card xl:border xl:border-brand-border-strong xl:p-8">
      <h1 className="type-h1 uppercase text-brand-ink" data-testid="auth-title">
        {view === "create" ? words.createTitle : words.signInTitle}
      </h1>
      <AuthViewSwitch view={view} next={next} email={email || null} />
      <p className="type-body text-brand-ink-muted">
        {view === "create" ? words.createWhy : words.signInWhy}
      </p>
      <AuthForm key={view} view={view} next={next} email={email} />
    </div>
  </div>
)

export default AuthTemplate
