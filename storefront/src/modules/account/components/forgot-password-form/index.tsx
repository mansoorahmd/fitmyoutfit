"use client"

import React, { useEffect, useRef, useState } from "react"

import { accountContent } from "@content/account"
import { ForgotResult, requestPasswordReset } from "@lib/data/password-reset"
import { RESET_LINK_MINUTES, takeCarriedEmail, validateForgot } from "@lib/util/password-reset"
import { FIELD_MAX } from "@lib/util/checkout-address"
import { fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { TextField } from "@modules/common/components/text-field"

const words = accountContent.forgot

const LINK =
  "inline-flex min-h-[44px] items-center self-start px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2"

type Stage = "start" | "requested" | "failed"

/**
 * The "Forgot your password?" form (contract m1-password-reset, section 3):
 * one email field, prefilled with what the sign-in form had (kept in the
 * browser's session storage, never in the address). After a request the page
 * says the same thing whether or not the email has an account, and the form
 * stays so the customer can ask again; a request that failed says so and
 * offers to try again. The server action checks the email again.
 */
const ForgotPasswordForm = () => {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [stage, setStage] = useState<Stage>("start")
  const [submitting, setSubmitting] = useState(false)
  const [round, setRound] = useState(0)
  const touched = useRef(false)
  const busy = useRef(false)

  // the email typed on the sign-in form, carried over once
  useEffect(() => {
    const carried = takeCarriedEmail()
    if (carried && !touched.current) setEmail(carried)
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    const found = validateForgot({ email })
    if (found.email) {
      setError(found.email)
      document.getElementById("forgot-email")?.focus()
      return
    }
    setError(undefined)
    busy.current = true
    setSubmitting(true)
    let result: ForgotResult
    try {
      result = await requestPasswordReset({ email })
    } catch {
      result = { kind: "failed" }
    }
    busy.current = false
    setSubmitting(false)
    if (result.kind === "invalid") {
      setError(result.errors.email)
      return
    }
    setRound((current) => current + 1)
    setStage(result.kind === "requested" ? "requested" : "failed")
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6" data-testid="forgot-form">
      <TextField
        id="forgot-email"
        name="email"
        label={accountContent.auth.fields.email}
        type="email"
        autoComplete="email"
        dir="ltr"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={FIELD_MAX.email}
        value={email}
        error={error}
        onChange={(e) => {
          touched.current = true
          setEmail(e.target.value)
          if (error && !validateForgot({ email: e.target.value }).email) setError(undefined)
        }}
        data-testid="forgot-email"
      />

      {stage === "requested" && (
        <Alert
          key={`requested-${round}`}
          variant="success"
          announce
          title={words.requestedTitle}
          data-testid="forgot-requested"
        >
          {fill(words.requestedBody, { minutes: RESET_LINK_MINUTES })}
        </Alert>
      )}
      {stage === "failed" && (
        <Alert key={`failed-${round}`} variant="error" announce focusOnMount title={words.failed} data-testid="forgot-failed" />
      )}

      <Button type="submit" fullWidth isLoading={submitting} loadingText={words.requesting} data-testid="forgot-submit">
        {stage === "requested" ? words.buttonAgain : stage === "failed" ? words.buttonRetry : words.button}
      </Button>

      <LocalizedClientLink href="/account" className={LINK} data-testid="forgot-back">
        {words.backToSignIn}
      </LocalizedClientLink>
    </form>
  )
}

export default ForgotPasswordForm
