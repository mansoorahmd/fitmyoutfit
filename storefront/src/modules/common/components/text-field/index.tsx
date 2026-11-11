"use client"

import { clx } from "@medusajs/ui"
import React from "react"

import FieldError from "@modules/common/components/field-error"

/**
 * The field's box (docs/design/05-m1-pages.md, 2.3): 48 px tall, 16 px
 * text (so iOS doesn't zoom), 12 px side padding, a 1 px `border-strong`
 * outline, 4 px radius, white fill. Hover: `ink` outline. Focus: the 2 px
 * focus ring with a 2 px offset and an `ink` outline. Error: a 2 px `error`
 * outline. Read-only: `surface-alt` fill and `ink-muted` text.
 */
export const fieldBoxClasses = ({
  invalid = false,
  readOnly = false,
}: { invalid?: boolean; readOnly?: boolean } = {}) =>
  clx(
    "block h-12 w-full min-w-0 rounded-control bg-white px-3 text-[16px] leading-6 text-brand-ink",
    "transition-colors duration-150 ease-out",
    "focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
    invalid
      ? "border-2 border-brand-error px-[11px]"
      : "border border-brand-border-strong hover:border-brand-ink focus:border-brand-ink",
    readOnly && "bg-brand-surface-alt text-brand-ink-muted hover:border-brand-border-strong"
  )

type FieldFrameProps = {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  className?: string
  children: React.ReactNode
  "data-testid"?: string
}

/** Ids for a field's hint and error, tied with aria-describedby. */
export const describedBy = (id: string, hint?: React.ReactNode, error?: string) =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
  undefined

/**
 * The label above, the hint under it, the control, then the error under
 * the control with the FieldError part. The label stays at the start of the
 * page's direction, whatever the field's own direction.
 */
const FieldFrame = ({
  id,
  label,
  hint,
  error,
  className,
  children,
  "data-testid": dataTestId,
}: FieldFrameProps) => (
  <div className={clx("flex min-w-0 flex-col gap-1", className)} data-testid={dataTestId}>
    <label htmlFor={id} className="type-body font-semibold text-brand-ink">
      {label}
    </label>
    {hint && (
      <p id={`${id}-hint`} className="type-small text-brand-ink-muted">
        {hint}
      </p>
    )}
    <div className="mt-1">{children}</div>
    {error && <FieldError id={`${id}-error`} className="mt-1">{error}</FieldError>}
  </div>
)

type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  "data-testid"?: string
  ref?: React.Ref<HTMLInputElement>
}

/** The store's text field (05, 2.3), for every form. */
export const TextField = ({
  id,
  label,
  hint,
  error,
  className,
  readOnly,
  "data-testid": dataTestId,
  ref,
  ...input
}: TextFieldProps) => (
  <FieldFrame id={id} label={label} hint={hint} error={error} className={className} data-testid={dataTestId}>
    <input
      {...input}
      ref={ref}
      id={id}
      readOnly={readOnly}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      className={fieldBoxClasses({ invalid: !!error, readOnly })}
    />
  </FieldFrame>
)

type SelectFieldProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  options: { value: string; label: string }[]
  /** An empty first choice ("Choose"), shown while nothing is chosen. */
  placeholder?: string
  "data-testid"?: string
  ref?: React.Ref<HTMLSelectElement>
}

/**
 * The same look with a chevron, on the native `<select>`, so phones show
 * their own picker (05, 2.3).
 */
export const SelectField = ({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  "data-testid": dataTestId,
  ref,
  ...select
}: SelectFieldProps) => (
  <FieldFrame id={id} label={label} hint={hint} error={error} className={className} data-testid={dataTestId}>
    <div className="relative">
      <select
        {...select}
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={clx(fieldBoxClasses({ invalid: !!error }), "appearance-none pe-10")}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-ink"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  </FieldFrame>
)

export default TextField
