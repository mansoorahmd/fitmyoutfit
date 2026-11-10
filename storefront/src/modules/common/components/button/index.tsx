import { clx } from "@medusajs/ui"
import React from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Spinner from "@modules/common/icons/spinner"
import { ButtonVariant, buttonClasses } from "./button-styles"

export type { ButtonVariant } from "./button-styles"

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled"
> & {
  variant?: ButtonVariant
  /**
   * Shown as inactive (aria-disabled) but stays focusable, so the reason in
   * the label or nearby can still be found. Presses are ignored.
   */
  disabled?: boolean
  /** Shows a spinner and `loadingText`, keeps its width and ignores presses. */
  isLoading?: boolean
  /** Label while loading, for example "Adding…". Defaults to the label. */
  loadingText?: React.ReactNode
  fullWidth?: boolean
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * The label and the loading label sit in the same grid cell, so the button
 * is as wide as the wider of the two and never changes width when loading.
 */
const ButtonContent = ({
  children,
  isLoading,
  loadingText,
}: {
  children: React.ReactNode
  isLoading: boolean
  loadingText?: React.ReactNode
}) => (
  <span className="grid place-items-center">
    <span
      className={clx(
        "col-start-1 row-start-1 inline-flex items-center gap-2",
        isLoading && "invisible"
      )}
      aria-hidden={isLoading || undefined}
    >
      {children}
    </span>
    <span
      className={clx(
        "col-start-1 row-start-1 inline-flex items-center gap-2",
        !isLoading && "invisible"
      )}
      aria-hidden={!isLoading || undefined}
      data-testid="button-loading"
    >
      <Spinner size={18} aria-hidden="true" />
      {loadingText ?? children}
    </span>
  </span>
)

/** The store's button: primary (main action, red), secondary or text. 48 px tall. */
export function Button({
  variant = "primary",
  disabled = false,
  isLoading = false,
  loadingText,
  fullWidth = false,
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const inactive = disabled || isLoading

  return (
    <button
      {...rest}
      type={type}
      aria-disabled={inactive || undefined}
      aria-busy={isLoading || undefined}
      className={clx(buttonClasses({ variant, inactive, fullWidth }), className)}
      onClick={(event) => {
        // also stops a submit button from submitting twice
        if (inactive) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
    >
      <ButtonContent isLoading={isLoading} loadingText={loadingText}>
        {children}
      </ButtonContent>
    </button>
  )
}

type ButtonLinkProps = {
  /** A path without the country code; the link adds it. */
  href: string
  variant?: ButtonVariant
  fullWidth?: boolean
  className?: string
  children: React.ReactNode
  onClick?: () => void
  "data-testid"?: string
}

/** A link that looks like the store's button, for actions that navigate. */
export function ButtonLink({
  href,
  variant = "primary",
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <LocalizedClientLink
      href={href}
      className={clx(buttonClasses({ variant, fullWidth }), className)}
      {...rest}
    >
      {children}
    </LocalizedClientLink>
  )
}

export default Button
