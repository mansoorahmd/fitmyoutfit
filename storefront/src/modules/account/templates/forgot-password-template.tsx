import { accountContent } from "@content/account"

import ForgotPasswordForm from "../components/forgot-password-form"

const words = accountContent.forgot

/**
 * "Forgot your password?" (contract m1-password-reset, section 3), laid
 * out as sign-in is: one column, at most 440 px wide, in a box from 1280 px.
 */
const ForgotPasswordTemplate = () => (
  <div className="content-container pb-12 pt-8 xl:py-16" data-testid="forgot-page">
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6 xl:rounded-card xl:border xl:border-brand-border-strong xl:p-8">
      <h1 className="type-h1 uppercase text-brand-ink" data-testid="forgot-title">
        {words.title}
      </h1>
      <p className="type-body text-brand-ink-muted">{words.intro}</p>
      <ForgotPasswordForm />
    </div>
  </div>
)

export default ForgotPasswordTemplate
