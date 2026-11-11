"use client"

import { cartContent } from "@content/cart"
import { Button, ButtonLink } from "@modules/common/components/button"

/**
 * The cart's checkout button, in the summary and on the sticky bar (docs/
 * design/05-m1-pages.md, 4.2 and 5.3):
 * - while a change is saved: inactive, "Updating…";
 * - below the minimum: inactive but focusable, its reason tied with
 *   aria-describedby; a press takes the customer to the minimum alert and
 *   never to checkout;
 * - otherwise a link to the checkout.
 */
const CheckoutAction = ({
  href,
  label,
  blocked,
  reasonId,
  updating,
  onBlockedPress,
  fullWidth = true,
  className,
  "data-testid": dataTestId,
}: {
  href: string
  label: string
  blocked: boolean
  /** The id of the text that says why it is inactive. */
  reasonId?: string
  updating: boolean
  onBlockedPress: () => void
  fullWidth?: boolean
  className?: string
  "data-testid"?: string
}) => {
  if (updating) {
    return (
      <Button
        isLoading
        loadingText={cartContent.updating}
        fullWidth={fullWidth}
        className={className}
        data-testid={dataTestId}
      >
        {label}
      </Button>
    )
  }

  if (blocked) {
    return (
      // The Button ignores presses while inactive; the press still reaches
      // this wrapper, which moves the customer to the reason.
      <div onClick={onBlockedPress} className={fullWidth ? "w-full" : undefined}>
        <Button
          disabled
          aria-describedby={reasonId}
          fullWidth={fullWidth}
          className={className}
          data-testid={dataTestId}
        >
          {label}
        </Button>
      </div>
    )
  }

  return (
    <ButtonLink
      href={href}
      fullWidth={fullWidth}
      className={className}
      data-testid={dataTestId}
    >
      {label}
    </ButtonLink>
  )
}

export default CheckoutAction
