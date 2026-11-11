import { clx } from "@medusajs/ui"
import React from "react"

import LineIcon from "@modules/home/components/line-icon"

/**
 * A message under a field or a control (docs/design/05-m1-pages.md, 2.3,
 * "Error"): the `alert` icon and the words in `small` semibold `error`,
 * never the colour alone. Tie it to the control with `aria-describedby`.
 * An optional action ("Try again") sits after the words.
 *
 * The icon stays beside the words: they wrap in their own column next to
 * it, so the icon is never left alone on a line on a narrow phone.
 */
const FieldError = ({
  id,
  children,
  action,
  className,
  "data-testid": dataTestId,
}: {
  id?: string
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
  "data-testid"?: string
}) => (
  <div
    id={id}
    className={clx(
      "flex items-start gap-x-2 type-small font-semibold text-brand-error",
      className
    )}
    data-testid={dataTestId ?? "field-error"}
  >
    <LineIcon name="alert" className="h-5 w-5 shrink-0" />
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
      data-testid="field-error-body"
    >
      <span className="min-w-0">{children}</span>
      {/* The action keeps its 44 px hit area without making the line taller,
          so the words stay level with the icon. */}
      {action && <span className="-my-3 flex">{action}</span>}
    </div>
  </div>
)

export default FieldError
