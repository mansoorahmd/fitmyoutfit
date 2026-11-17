"use client"

import { useParams } from "next/navigation"
import React, { useEffect, useRef, useState } from "react"

import { accountContent } from "@content/account"
import { ResetResult, resetPassword } from "@lib/data/password-reset"
import { MIN_PASSWORD_LENGTH } from "@lib/util/account-auth"
import { RESET_LINK_MINUTES, carryEmail, validateNewPassword } from "@lib/util/password-reset"
import { fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import { Button, ButtonLink } from "@modules/common/components/button"

import { loadPage } from "../../load-page"
import PasswordField from "../password-field"

const words = accountContent.reset

/**
 * What the page shows when the link no longer works (expired, used, wrong,
 * or missing its token or email): one plain message and a button that asks
 * for a new link, with the email carried over in the browser.
 */
const LinkGone = ({ email, focusHeading }: { email: string | null; focusHeading: boolean }) => {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusHeading) heading.current?.focus()
  }, [focusHeading])
  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="type-h1 uppercase text-brand-ink outline-none" data-testid="reset-title">
        {words.goneTitle}
      </h1>
      <p className="type-body text-brand-ink-muted" data-testid="reset-gone">
        {fill(words.goneBody, { minutes: RESET_LINK_MINUTES })}
      </p>
      <ButtonLink
        href="/account/forgot-password"
        fullWidth
        onClick={() => carryEmail(email ?? "")}
        data-testid="reset-ask-again"
      >
        {words.goneButton}
      </ButtonLink>
    </>
  )
}

/**
 * The page a reset link opens (contract m1-password-reset, section 3):
 * the account's email (not editable) and one new-password field with
 * create-account's rule. The password is checked here and again on the
 * server before anything goes to the store, because a refused or empty
 * password would use the link up. A second press while the first is
 * running is ignored. The token is never in this component: it stays in
 * the sealed cookie the server action opens (lib/util/reset-cookie.ts).
 *
 * `email` is null when the page has no usable link (no cookie, expired or
 * altered): it then shows the "link no longer works" message.
 */
const ResetPasswordForm = ({ email }: { email: string | null }) => {
  const { countryCode } = useParams() as { countryCode: string }
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [problem, setProblem] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [gone, setGone] = useState(false)
  const busy = useRef(false)
  const field = useRef<HTMLInputElement>(null)

  if (email === null || gone) {
    return <LinkGone email={email} focusHeading={gone} />
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setProblem(false)
    const found = validateNewPassword({ password })
    if (found.password) {
      setError(found.password)
      field.current?.focus()
      return
    }
    setError(undefined)
    busy.current = true
    setSubmitting(true)

    let result: ResetResult
    try {
      result = await resetPassword({ password }, countryCode)
    } catch {
      result = { kind: "failed" }
    }
    if (result.kind === "changed") {
      // the page loads sign-in; the button stays busy meanwhile
      loadPage(result.href)
      return
    }
    busy.current = false
    setSubmitting(false)
    if (result.kind === "gone") {
      setGone(true)
      return
    }
    if (result.kind === "invalid") {
      setError(result.errors.password)
      field.current?.focus()
      return
    }
    setProblem(true)
  }

  return (
    <>
      <h1 className="type-h1 uppercase text-brand-ink" data-testid="reset-title">
        {words.title}
      </h1>
      {/* No input has a `name`: a submit before the page's script has loaded would otherwise put the password and the email in the address */}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6" data-testid="reset-form">
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="type-body font-semibold text-brand-ink">{words.emailLabel}</p>
            <p dir="ltr" className="type-body wrap-anywhere text-brand-ink" data-testid="reset-email">
              {email}
            </p>
            {/* so a password manager files the new password under this email; not for people */}
            <input
              type="text"
              autoComplete="username"
              value={email}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
          </div>
          <PasswordField
            id="reset-password"
            ref={field}
            label={words.passwordLabel}
            hint={fill(accountContent.auth.fields.passwordHint, { min: MIN_PASSWORD_LENGTH })}
            error={error}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error && !validateNewPassword({ password: e.target.value }).password) setError(undefined)
            }}
            autoComplete="new-password"
            data-testid="reset-field"
          />
        </div>

        {problem && (
          <Alert variant="error" announce focusOnMount title={words.failed} data-testid="reset-failed" />
        )}

        <Button type="submit" fullWidth isLoading={submitting} loadingText={words.saving} data-testid="reset-submit">
          {words.button}
        </Button>
      </form>
    </>
  )
}

export default ResetPasswordForm
