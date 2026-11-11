"use client"

import { Fragment } from "react"

import { cartContent } from "@content/cart"
import { AddedToCartView } from "@lib/util/added-to-cart"
import { fillParts } from "@lib/util/wording"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import LineIcon from "@modules/home/components/line-icon"

/**
 * After an add from the phone's sticky buy bar, the inline confirmation is
 * out of view, so this shows too (docs/design/05-m1-pages.md, 4.7): "Added:
 * Jersey, M × 4" and "View cart", on navy, 8 px above the sticky bar. It
 * stays until it is closed or the inline box is scrolled into view.
 */
const AddedSnackbar = ({
  view,
  onClose,
}: {
  view: AddedToCartView
  onClose: () => void
}) => {
  const words = cartContent.added
  const message = fillParts(view.size ? words.snackbar : words.snackbarNoSize, {
    title: <bdi>{view.title}</bdi>,
    size: view.size ?? "",
    quantity: view.quantity,
  })

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-card bg-brand-inverse py-1 pl-4 pr-1 text-brand-on-inverse shadow-xl lg:hidden"
      data-testid="added-snackbar"
    >
      <p className="min-w-0 flex-1 type-small font-semibold">
        {message.map((part, index) => (
          <Fragment key={index}>{part}</Fragment>
        ))}
      </p>
      <LocalizedClientLink
        href="/cart"
        className="inline-flex min-h-[44px] shrink-0 items-center px-3 type-small font-semibold underline underline-offset-4"
      >
        {words.viewCart}
      </LocalizedClientLink>
      <button
        type="button"
        onClick={onClose}
        aria-label={words.close}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-brand-on-inverse/10"
      >
        <LineIcon name="x" className="h-5 w-5" />
      </button>
    </div>
  )
}

export default AddedSnackbar
