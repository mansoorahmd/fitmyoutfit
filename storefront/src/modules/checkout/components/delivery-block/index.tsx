"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { checkoutContent } from "@content/checkout"
import { retryDelivery } from "@lib/data/checkout"
import { cartContent } from "@content/cart"
import { CheckoutView } from "@lib/util/checkout-view"
import RushChoice, { useRushSaving } from "@modules/cart/components/rush-choice"
import Alert from "@modules/common/components/alert"
import Amount from "@modules/common/components/amount"
import { Button } from "@modules/common/components/button"
import DeliveryDateLine from "@modules/common/components/delivery-date-line"

export const DELIVERY_ALERT_ID = "checkout-delivery-alert"

const words = checkoutContent.deliveryBlock

/**
 * Step 2's delivery block (docs/design/05-m1-pages.md, 6.5 a): the region's
 * one option as a line, not a choice: "Delivery in Pakistan · PKR 250", or
 * "Shipping & duties included · Included" (never "GBP 0.00", which would
 * read as free shipping). Under it the "Delivery speed" control (when rush
 * is offered; contract 9), then the delivery date, which is the rush date
 * while the cart holds rush. Never a duties line.
 * When the option couldn't be added on save: W-K14 with "Try again".
 */
const DeliveryBlock = ({ view }: { view: CheckoutView }) => {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [failedAgain, setFailedAgain] = useState(0)
  const updating = useRushSaving()
  const row = view.summary.delivery

  if (!view.deliveryReady) {
    const retry = async () => {
      setRetrying(true)
      try {
        const { ok } = await retryDelivery()
        if (ok) router.refresh()
        else setFailedAgain((n) => n + 1)
      } catch {
        setFailedAgain((n) => n + 1)
      } finally {
        setRetrying(false)
      }
    }
    return (
      <Alert
        key={failedAgain}
        id={DELIVERY_ALERT_ID}
        variant="error"
        announce
        focusable
        title={words.failed}
        action={
          <Button variant="secondary" isLoading={retrying} onClick={retry} data-testid="retry-delivery">
            {words.tryAgain}
          </Button>
        }
        data-testid="delivery-failed"
      />
    )
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-card border border-brand-border p-4"
      data-testid="delivery-block"
    >
      {row && row.kind !== "at_checkout" && (
        <p className="flex items-baseline justify-between gap-4 type-body text-brand-ink" data-testid="delivery-line">
          <bdi className="font-semibold">{row.label}</bdi>
          {row.kind === "included" ? (
            <span>{words.included}</span>
          ) : (
            <Amount>{view.summary.deliveryAmount}</Amount>
          )}
        </p>
      )}
      <RushChoice heading="h3" />
      {view.rushDropped && (
        <p role="status" className="type-small text-brand-ink-muted" data-testid="delivery-rush-dropped">
          {cartContent.rush.dropped}
        </p>
      )}
      {!view.summary.rulesFailed && (
        <DeliveryDateLine date={view.summary.deliveryDate} loading={updating} />
      )}
    </div>
  )
}

export default DeliveryBlock
