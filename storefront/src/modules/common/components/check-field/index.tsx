"use client"

import { clx } from "@medusajs/ui"
import React from "react"

/**
 * A native checkbox with its label (docs/design/05-m1-pages.md, 6.4,
 * fields 12 and 13): a 24 px box in a row at least 44 px tall, the whole
 * row pressable.
 */
const CheckField = ({
  id,
  label,
  checked,
  onChange,
  className,
  "data-testid": dataTestId,
}: {
  id: string
  label: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  "data-testid"?: string
}) => (
  <label
    htmlFor={id}
    className={clx("flex min-h-[44px] cursor-pointer items-center gap-3 type-body text-brand-ink", className)}
    data-testid={dataTestId}
  >
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-6 w-6 shrink-0 cursor-pointer rounded-[2px] border border-brand-border-strong accent-brand-ink"
    />
    <span>{label}</span>
  </label>
)

export default CheckField
