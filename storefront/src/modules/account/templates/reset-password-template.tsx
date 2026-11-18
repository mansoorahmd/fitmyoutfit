import ResetPasswordForm from "../components/reset-password-form"

/**
 * The page a reset link opens (contract m1-password-reset, section 3), laid
 * out as sign-in is: one column, at most 440 px wide, in a box from 1280 px.
 * It is given the account's email only; the token never leaves the server.
 */
const ResetPasswordTemplate = ({ email }: { email: string | null }) => (
  <div className="content-container pb-12 pt-8 xl:py-16" data-testid="reset-page">
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6 xl:rounded-card xl:border xl:border-brand-border-strong xl:p-8">
      <ResetPasswordForm email={email} />
    </div>
  </div>
)

export default ResetPasswordTemplate
