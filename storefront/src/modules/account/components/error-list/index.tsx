"use client"

import { checkoutContent } from "@content/checkout"
import Alert from "@modules/common/components/alert"

/**
 * The short error list at the top of a form with 3 or more errors
 * (docs/design/05-m1-pages.md, 2.3), with a link to each field, as the
 * checkout's address step has it.
 */
const ErrorList = ({
  items,
  onPick,
  "data-testid": dataTestId,
}: {
  items: { id: string; message: string }[]
  onPick: (id: string) => void
  "data-testid"?: string
}) => (
  <Alert variant="error" title={checkoutContent.address.errorListTitle} announce data-testid={dataTestId ?? "error-list"}>
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={(event) => {
              event.preventDefault()
              onPick(item.id)
            }}
            className="inline-flex min-h-[44px] items-center underline underline-offset-4"
          >
            {item.message}
          </a>
        </li>
      ))}
    </ul>
  </Alert>
)

/** Moves focus to a field and brings it into view. */
export const focusField = (id: string) => {
  const element = document.getElementById(id)
  element?.focus()
  element?.scrollIntoView?.({ block: "center" })
}

export default ErrorList
