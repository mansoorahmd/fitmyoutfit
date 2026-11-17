"use client"

import React from "react"

import { checkoutContent } from "@content/checkout"
import { PaymentChoiceView } from "@lib/util/checkout-payment"
import { fill } from "@lib/util/wording"
import FieldError from "@modules/common/components/field-error"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RadioCard from "@modules/common/components/radio-card"
import { RushCodHint } from "@modules/cart/components/rush-choice"
import LineIcon from "@modules/home/components/line-icon"

export const PAYMENT_GROUP_ID = "checkout-payment-group"

const words = checkoutContent.payment

/**
 * The payment choice (docs/design/05-m1-pages.md, 6.5 b): a radio group of
 * cards. The placeholder payment in every region; cash on delivery in
 * Pakistan, inactive with the limit when the cart is over it, left out when
 * the rules didn't load (with W-P7). While a session starts, the chosen
 * card shows a spinner and the others ignore presses; a failure puts the
 * choice back and says W-P8 under the group.
 */
const PaymentChoice = ({
  choice,
  chosen,
  loadingId,
  selectFailed,
  onChoose,
  groupRef,
  rushHint = false,
}: {
  choice: PaymentChoiceView
  chosen: string | null
  loadingId: string | null
  selectFailed: boolean
  onChoose: (id: string) => void
  groupRef?: React.Ref<HTMLDivElement>
  /** Over the limit with rush in the cart: the hint adds "Choose Standard delivery" (contract 9). */
  rushHint?: boolean
}) => {
  const errorId = `${PAYMENT_GROUP_ID}-error`

  return (
    <section aria-labelledby="checkout-payment-title" className="flex flex-col gap-3" data-testid="payment-choice">
      <h3 id="checkout-payment-title" className="type-h3 text-brand-ink">
        {words.title}
      </h3>
      <div
        ref={groupRef}
        id={PAYMENT_GROUP_ID}
        role="radiogroup"
        aria-labelledby="checkout-payment-title"
        aria-describedby={selectFailed ? errorId : undefined}
        tabIndex={-1}
        className="flex flex-col gap-3 rounded-card"
      >
        {choice.options.map((option) => {
          const isCod = option.kind === "cod"
          const title = isCod ? words.cod.title : words.test.title
          return (
            <RadioCard
              key={option.id}
              id={`payment-${option.id}`}
              name="payment"
              value={option.id}
              checked={chosen === option.id}
              onSelect={onChoose}
              title={title}
              inactive={!option.selectable}
              loading={loadingId === option.id}
              busy={!!loadingId && loadingId !== option.id}
              data-testid={`payment-option-${option.kind}`}
            >
              {option.selectable ? (
                isCod ? words.cod.text : words.test.text
              ) : (
                <span className="flex items-start gap-1.5">
                  <LineIcon name="alert" className="h-5 w-5 shrink-0" />
                  <span>{fill(words.cod.overLimit, { limit: option.limit ?? "" })}</span>
                </span>
              )}
            </RadioCard>
          )
        })}
      </div>

      {choice.notice === "over_limit" && (
        <p className="type-small text-brand-ink" data-testid="cod-lower-total">
          {words.cod.lowerTotal}{" "}
          <LocalizedClientLink
            href="/cart"
            className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4 hover:decoration-2"
          >
            {words.cod.backToCart}
          </LocalizedClientLink>
        </p>
      )}
      {choice.notice === "over_limit" && rushHint && <RushCodHint />}
      {choice.notice === "cod_failed" && (
        <p className="type-small text-brand-ink-muted" data-testid="cod-failed">
          {words.cod.failed}
        </p>
      )}
      {selectFailed && (
        <FieldError id={errorId} data-testid="payment-select-error">
          {words.selectFailed}
        </FieldError>
      )}
    </section>
  )
}

export default PaymentChoice
