"use client"

import { clx } from "@medusajs/ui"
import React, { useEffect, useId, useState } from "react"

import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  commitTypedQuantity,
  readTypedQuantity,
  stepperButtons,
} from "@lib/util/quantity"
import FieldError from "@modules/common/components/field-error"
import LineIcon from "@modules/home/components/line-icon"

type QuantityStepperProps = {
  /** The current number. */
  value: number
  /** Called with a new number from − or +, and with a typed one unless `onTyped` is given. */
  onChange: (value: number) => void
  /**
   * Called with a typed number once it is taken: when the field loses focus
   * or Enter is pressed, and only when it is valid and new. Never while
   * typing, so "1000" is never taken as "100" on the way.
   */
  onTyped?: (value: number) => void
  /** Called when the field or a button loses focus (the cart saves then). */
  onBlur?: () => void
  min?: number
  max?: number
  /** "Quantity, Jersey, size M" */
  label: string
  decreaseLabel: string
  increaseLabel: string
  /** W-C9, shown when a typed number is out of range: "Enter a number from 1 to 999". */
  rangeMessage: string
  /** While a change is saved: still usable, but the buttons ignore presses. */
  ignorePresses?: boolean
  /** Another message's id (a save error) to tie to the field. */
  describedBy?: string
  className?: string
  "data-testid"?: string
}

const BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center text-brand-ink transition-colors duration-150 ease-out hover:bg-brand-surface-alt " +
  "aria-disabled:cursor-not-allowed aria-disabled:text-brand-ink-muted aria-disabled:hover:bg-transparent"

/**
 * [−] [number] [+] (docs/design/05-m1-pages.md, 2.7): 44 px buttons and a
 * 56 px field, 144 × 44 in a 1 px outline. − is inactive at the minimum and
 * + at the maximum (aria-disabled, still focusable). A typed number is
 * taken on blur or Enter; one out of range puts back the number from before
 * typing, with the reason under the stepper.
 */
const QuantityStepper = ({
  value,
  onChange,
  onTyped,
  onBlur,
  min = MIN_QUANTITY,
  max = MAX_QUANTITY,
  label,
  decreaseLabel,
  increaseLabel,
  rangeMessage,
  ignorePresses = false,
  describedBy,
  className,
  "data-testid": dataTestId,
}: QuantityStepperProps) => {
  const id = useId()
  const messageId = `${id}-range`
  const [text, setText] = useState(String(value))
  const [rangeError, setRangeError] = useState(false)

  // A new value from outside (a press, a save, a revert) replaces the text.
  useEffect(() => {
    setText(String(value))
  }, [value])

  const { canDecrease, canIncrease } = stepperButtons(value, min, max)

  const step = (by: number) => {
    if (ignorePresses) {
      return
    }
    const next = value + by
    if (next < min || next > max) {
      return
    }
    setRangeError(false)
    onChange(next)
  }

  // Typing only changes the text; the number is taken on blur or Enter.
  const onType = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value
    setText(typed)
    if (readTypedQuantity(typed, min, max).kind === "valid") {
      setRangeError(false)
    }
  }

  const commit = () => {
    const result = commitTypedQuantity(text, value, min, max)
    setText(String(result.value))
    setRangeError(result.rangeError)
    if (result.changed) {
      const take = onTyped ?? onChange
      take(result.value)
    }
  }

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      commit()
    }
  }

  // Focus leaving the whole stepper, not moving from − to the field.
  const onGroupBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onBlur?.()
    }
  }

  const described = [rangeError ? messageId : null, describedBy]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={clx("flex flex-col gap-2", className)} data-testid={dataTestId ?? "quantity-stepper"}>
      {/* 144 × 44 inside a 1 px outline */}
      <div
        onBlur={onGroupBlur}
        className="inline-flex h-[46px] w-[146px] items-stretch self-start rounded-control border border-brand-border-strong bg-brand-surface"
      >
        <button
          type="button"
          aria-label={decreaseLabel}
          aria-disabled={!canDecrease || ignorePresses || undefined}
          onClick={() => step(-1)}
          className={clx(BUTTON, "rounded-s-control")}
          data-testid="quantity-decrease"
        >
          <LineIcon name="minus" className="h-5 w-5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          aria-label={label}
          aria-invalid={rangeError || undefined}
          aria-describedby={described || undefined}
          value={text}
          onChange={onType}
          onBlur={commit}
          onKeyDown={onFieldKeyDown}
          onFocus={(event) => event.target.select()}
          className="w-14 border-x border-brand-border bg-transparent text-center type-body font-semibold tabular-nums text-brand-ink"
          data-testid="quantity-input"
        />
        <button
          type="button"
          aria-label={increaseLabel}
          aria-disabled={!canIncrease || ignorePresses || undefined}
          onClick={() => step(1)}
          className={clx(BUTTON, "rounded-e-control")}
          data-testid="quantity-increase"
        >
          <LineIcon name="plus" className="h-5 w-5" />
        </button>
      </div>
      {rangeError && (
        // As wide as the stepper and no wider: the message wraps under it
        // instead of widening the stepper and pushing the product page's
        // "Add to cart" past the edge of a 390 px phone.
        <div className="w-0 min-w-full" data-testid="quantity-range-error-box">
          <FieldError id={messageId} data-testid="quantity-range-error">
            {rangeMessage}
          </FieldError>
        </div>
      )}
    </div>
  )
}

export default QuantityStepper
