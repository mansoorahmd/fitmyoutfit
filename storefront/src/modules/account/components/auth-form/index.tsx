"use client"

import { useParams } from "next/navigation"
import React, { useRef, useState } from "react"

import { accountContent } from "@content/account"
import { errorContent } from "@content/errors"
import { AuthResult, signIn, signUp } from "@lib/data/customer"
import {
  AuthProblem,
  AuthView,
  CREATE_FIELDS,
  CreateValues,
  MIN_PASSWORD_LENGTH,
  SIGN_IN_FIELDS,
  SignInValues,
  authHref,
  authProblemText,
  validateCreate,
  validateSignIn,
} from "@lib/util/account-auth"
import { FIELD_MAX } from "@lib/util/checkout-address"
import { fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { TextField } from "@modules/common/components/text-field"

import { loadPage } from "../../load-page"
import ErrorList, { focusField } from "../error-list"
import PasswordField from "../password-field"

const words = accountContent.auth

type Values = CreateValues
type Key = keyof Values

const fieldId = (key: Key) => `auth-${key}`

const LINK =
  "inline-flex min-h-[44px] items-center self-start px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2"

/**
 * The sign-in and create-account form (docs/design/05-m1-pages.md, 8.3 and
 * 8.4). A field is checked when it loses focus after an edit; every field
 * on submit, with focus on the first error and the error list from 3
 * errors. The server action checks again, signs in and goes to `next`.
 * A wrong email or password clears the password, keeps the email and
 * moves focus to the message.
 */
const AuthForm = ({
  view,
  next,
  email,
}: {
  view: AuthView
  /** As it came in the URL; the server decides whether it is safe. */
  next: string | null
  /** From `?email=` (the confirmation's "Create an account"). */
  email: string
}) => {
  const { countryCode } = useParams() as { countryCode: string }
  const creating = view === "create"
  const [values, setValues] = useState<Values>({
    firstName: "",
    lastName: "",
    email,
    phone: "",
    password: "",
  })
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [listShown, setListShown] = useState(false)
  const [problem, setProblem] = useState<AuthProblem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const edited = useRef(new Set<Key>())
  const busy = useRef(false)

  const order: Key[] = creating ? CREATE_FIELDS : SIGN_IN_FIELDS
  const check = (current: Values): Partial<Record<Key, string>> =>
    creating
      ? validateCreate(current, countryCode)
      : validateSignIn({ email: current.email, password: current.password } as SignInValues)

  const setField = (key: Key, value: string) => {
    edited.current.add(key)
    const next = { ...values, [key]: value }
    setValues(next)
    // a message already shown goes as soon as the field is right
    if (errors[key] && !check(next)[key]) {
      setErrors((current) => {
        const rest = { ...current }
        delete rest[key]
        return rest
      })
    }
  }

  const checkOne = (key: Key) => {
    if (!edited.current.has(key)) return
    const message = check(values)[key]
    setErrors((current) => {
      const nextErrors = { ...current }
      if (message) nextErrors[key] = message
      else delete nextErrors[key]
      return nextErrors
    })
  }

  const showErrors = (found: Partial<Record<Key, string>>) => {
    const keys = order.filter((key) => found[key])
    setErrors(found)
    setListShown(keys.length >= 3)
    if (keys[0]) requestAnimationFrame(() => focusField(fieldId(keys[0])))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setProblem(null)

    const found = check(values)
    if (Object.keys(found).length > 0) {
      showErrors(found)
      return
    }
    setErrors({})
    setListShown(false)
    busy.current = true
    setSubmitting(true)

    let result: AuthResult
    try {
      result = creating
        ? await signUp(values, countryCode, next)
        : await signIn({ email: values.email, password: values.password }, countryCode, next)
    } catch {
      result = { kind: "problem", problem: "unreachable" }
    }
    if (result.kind === "signed_in") {
      // the page loads the next one; the button stays busy meanwhile
      loadPage(result.href)
      return
    }

    busy.current = false
    setSubmitting(false)
    if (result.kind === "invalid") {
      showErrors(result.errors as Partial<Record<Key, string>>)
      return
    }
    if (result.problem === "wrong") {
      setValues((current) => ({ ...current, password: "" }))
    }
    setProblem(result.problem)
  }

  const errorKeys = order.filter((key) => errors[key])

  const text = (
    key: Key,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <TextField
      id={fieldId(key)}
      name={key}
      label={label}
      error={errors[key]}
      value={values[key]}
      onChange={(e) => setField(key, e.target.value)}
      onBlur={() => checkOne(key)}
      data-testid={`field-${key}`}
      {...props}
    />
  )

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6" data-testid={`auth-form-${view}`}>
      {listShown && errorKeys.length >= 3 && (
        <ErrorList
          items={errorKeys.map((key) => ({ id: fieldId(key), message: errors[key] as string }))}
          onPick={focusField}
        />
      )}

      <div className="flex flex-col gap-4">
        {creating && (
          <>
            {text("firstName", words.fields.firstName, {
              autoComplete: "given-name",
              dir: "auto",
              maxLength: FIELD_MAX.first_name,
            })}
            {text("lastName", words.fields.lastName, {
              autoComplete: "family-name",
              dir: "auto",
              maxLength: FIELD_MAX.last_name,
            })}
          </>
        )}
        {text("email", words.fields.email, {
          type: "email",
          autoComplete: "email",
          dir: "ltr",
          inputMode: "email",
          autoCapitalize: "none",
          spellCheck: false,
          maxLength: FIELD_MAX.email,
        })}
        {creating &&
          text("phone", words.fields.phone, {
            type: "tel",
            autoComplete: "tel",
            dir: "ltr",
            inputMode: "tel",
            maxLength: FIELD_MAX.phone,
          })}
        <PasswordField
          id={fieldId("password")}
          name="password"
          label={words.fields.password}
          hint={creating ? fill(words.fields.passwordHint, { min: MIN_PASSWORD_LENGTH }) : undefined}
          error={errors.password}
          value={values.password}
          onChange={(e) => setField("password", e.target.value)}
          onBlur={() => checkOne("password")}
          autoComplete={creating ? "new-password" : "current-password"}
          data-testid="field-password"
          after={
            !creating && words.forgotPassword.show ? (
              <LocalizedClientLink href={words.forgotPassword.href} className={LINK} data-testid="forgot-password">
                {words.forgotPassword.label}
              </LocalizedClientLink>
            ) : undefined
          }
        />
      </div>

      {problem && (
        <Alert
          key={problem}
          variant="error"
          announce
          focusOnMount
          title={authProblemText(problem, errorContent.server.title)}
          action={
            problem === "exists" ? (
              <LocalizedClientLink
                href={authHref("signin", { next, email: values.email.trim() })}
                className={LINK}
                data-testid="sign-in-instead"
              >
                {words.errors.signInInstead}
              </LocalizedClientLink>
            ) : undefined
          }
          data-testid="auth-problem"
        />
      )}

      <Button
        type="submit"
        fullWidth
        isLoading={submitting}
        loadingText={creating ? words.creating : words.signingIn}
        data-testid="auth-submit"
      >
        {creating ? words.createButton : words.signInButton}
      </Button>
    </form>
  )
}

export default AuthForm
