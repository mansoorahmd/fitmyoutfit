"use client"

import { clx } from "@medusajs/ui"
import React, { useState } from "react"

import { accountContent } from "@content/account"
import FieldError from "@modules/common/components/field-error"
import { describedBy, fieldBoxClasses } from "@modules/common/components/text-field"

const words = accountContent.auth.password

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  /** Under the field, after the error: the "Forgot your password?" link once it exists. */
  after?: React.ReactNode
  "data-testid"?: string
  ref?: React.Ref<HTMLInputElement>
}

/**
 * The password field (docs/design/05-m1-pages.md, 2.3 and 10.1): the same
 * label, hint, box and error as TextField, with a "Show" / "Hide" text
 * button inside the right end, 44 × 44 px, that says what it does in words.
 * Left to right whatever the page's direction.
 */
const PasswordField = ({
  id,
  label,
  hint,
  error,
  after,
  className,
  "data-testid": dataTestId,
  ref,
  ...input
}: PasswordFieldProps) => {
  const [shown, setShown] = useState(false)

  return (
    <div className={clx("flex min-w-0 flex-col gap-1", className)} data-testid={dataTestId}>
      <label htmlFor={id} className="type-body font-semibold text-brand-ink">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="type-small text-brand-ink-muted">
          {hint}
        </p>
      )}
      <div className="relative mt-1">
        <input
          {...input}
          ref={ref}
          id={id}
          type={shown ? "text" : "password"}
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={clx(fieldBoxClasses({ invalid: !!error }), "pe-16")}
        />
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          aria-label={shown ? words.hideLabel : words.showLabel}
          aria-controls={id}
          className="absolute end-0.5 top-1/2 flex h-11 min-w-[56px] -translate-y-1/2 items-center justify-center rounded-control px-2 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2 focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-focus"
          data-testid="password-toggle"
        >
          {shown ? words.hide : words.show}
        </button>
      </div>
      {error && (
        <FieldError id={`${id}-error`} className="mt-1">
          {error}
        </FieldError>
      )}
      {after}
    </div>
  )
}

export default PasswordField
