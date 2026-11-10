"use client"

import React from "react"
import { useFormStatus } from "react-dom"

import { Button, ButtonVariant } from "."

/** The store's button as a form's submit button: loading while the form is sent. */
export function FormSubmitButton({
  children,
  loadingText,
  variant = "primary",
  fullWidth = true,
  className,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode
  loadingText?: React.ReactNode
  variant?: ButtonVariant
  fullWidth?: boolean
  className?: string
  "data-testid"?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant={variant}
      fullWidth={fullWidth}
      isLoading={pending}
      loadingText={loadingText}
      className={className}
      data-testid={dataTestId}
    >
      {children}
    </Button>
  )
}

export default FormSubmitButton
