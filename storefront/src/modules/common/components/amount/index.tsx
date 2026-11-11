import { clx } from "@medusajs/ui"
import React from "react"

/**
 * An amount of money as every page shows it (docs/design/05-m1-pages.md,
 * 2.4): left to right and never broken, so "PKR 21,000" doesn't split or
 * flip inside right-to-left text. While `loading`, the same text is drawn
 * as a grey bar of its own width, so nothing moves when the new amount
 * arrives; it is hidden from screen readers meanwhile.
 */
const Amount = ({
  children,
  loading = false,
  className,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode
  loading?: boolean
  className?: string
  "data-testid"?: string
}) => (
  <span
    dir="ltr"
    className={clx(
      "whitespace-nowrap",
      loading &&
        "animate-pulse rounded-control bg-brand-border text-transparent [&_*]:text-transparent",
      className
    )}
    aria-hidden={loading || undefined}
    data-loading={loading ? "true" : undefined}
    data-testid={dataTestId}
  >
    {children}
  </span>
)

export default Amount
