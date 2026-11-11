"use client"

import { clx } from "@medusajs/ui"
import Image from "next/image"
import { Fragment, useEffect, useId, useRef, useState } from "react"

import { cartContent } from "@content/cart"
import { productContent } from "@content/product"
import { deleteLineItem, updateLineItem } from "@lib/data/cart"
import { CartLineView } from "@lib/util/cart-view"
import { fill, fillParts } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import FieldError from "@modules/common/components/field-error"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import QuantityStepper from "@modules/common/components/quantity-stepper"
import GarmentOutline from "@modules/common/icons/garment-outline"
import Spinner from "@modules/common/icons/spinner"
import LineIcon from "@modules/home/components/line-icon"

import { useAnnounceRemoved } from "../undo-toast/provider"

/** A change is saved after this long without another press (05, 2.7). */
export const SAVE_DELAY_MS = 600

type CartLineProps = {
  line: CartLineView
  /** Export regions add "Not counted towards the minimum" to the fit kit. */
  exportRegion: boolean
  /** Tells the page a save started or ended, for the summary's grey bars. */
  onSaving: (lineId: string, saving: boolean) => void
}

/**
 * One cart line (docs/design/05-m1-pages.md, 4.3): the thumbnail, the title
 * and line total, "Size: M · PKR 3,500 each", the fit kit's notes, then the
 * quantity stepper and Remove. A quantity change is saved 600 ms after the
 * last press, or when focus leaves the stepper. Errors show under the line
 * with "Try again".
 */
const CartLine = ({ line, exportRegion, onSaving }: CartLineProps) => {
  const { line: words } = cartContent
  const onRemoved = useAnnounceRemoved()
  const errorId = useId()
  const [quantity, setQuantity] = useState(line.quantity)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<
    { kind: "quantity"; value: number } | { kind: "remove" } | null
  >(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The saved value from the server replaces the local one.
  useEffect(() => {
    setQuantity(line.quantity)
  }, [line.quantity])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const save = async (value: number) => {
    timer.current = null
    if (value === line.quantity) {
      return
    }
    setSaving(true)
    onSaving(line.id, true)
    try {
      await updateLineItem({ lineId: line.id, quantity: value })
      setError(null)
    } catch {
      setQuantity(line.quantity)
      setError({ kind: "quantity", value })
    } finally {
      setSaving(false)
      onSaving(line.id, false)
    }
  }

  const change = (value: number) => {
    setQuantity(value)
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(value), SAVE_DELAY_MS)
  }

  const saveNow = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      save(quantity)
    }
  }

  const remove = async () => {
    if (removing) return
    if (timer.current) clearTimeout(timer.current)
    setRemoving(true)
    setError(null)
    onSaving(line.id, true)
    try {
      await deleteLineItem(line.id)
      onRemoved({
        title: line.title,
        size: line.size,
        quantity: line.quantity,
        variantId: line.variantId,
      })
    } catch {
      setRemoving(false)
      setError({ kind: "remove" })
    } finally {
      onSaving(line.id, false)
    }
  }

  const retry = () => {
    if (error?.kind === "quantity") {
      setQuantity(error.value)
      save(error.value)
    } else if (error?.kind === "remove") {
      remove()
    }
  }

  const sizeWords = line.size ? fill(words.size, { size: line.size }) : null
  const named = { title: line.title, size: line.size ?? "" }
  const productHref = line.productHandle ? `/products/${line.productHandle}` : null

  const thumbnail = (
    <span className="relative block h-[90px] w-[72px] overflow-hidden rounded-control bg-brand-surface-alt md:h-[120px] md:w-24">
      {line.thumbnail ? (
        <Image
          src={line.thumbnail}
          alt=""
          fill
          sizes="96px"
          quality={50}
          className="object-contain"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <GarmentOutline className="w-1/2 text-brand-border-strong" />
        </span>
      )}
      {removing && (
        <span className="absolute inset-0 flex items-center justify-center bg-brand-surface/60">
          <Spinner size={24} aria-hidden="true" />
        </span>
      )}
    </span>
  )

  return (
    <li
      className={clx(
        "grid grid-cols-[72px_1fr] gap-3 py-4 md:grid-cols-[96px_1fr]",
        removing && "opacity-50"
      )}
      aria-busy={removing || saving || undefined}
      data-testid="cart-line"
    >
      {productHref ? (
        <LocalizedClientLink href={productHref} tabIndex={-1} aria-hidden="true">
          {thumbnail}
        </LocalizedClientLink>
      ) : (
        thumbnail
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 type-body font-semibold text-brand-ink" dir="auto">
            {productHref ? (
              <LocalizedClientLink
                href={productHref}
                className="hover:underline"
                data-testid="cart-line-title"
              >
                <bdi>{line.title}</bdi>
              </LocalizedClientLink>
            ) : (
              <bdi data-testid="cart-line-title">{line.title}</bdi>
            )}
          </p>
          <Amount
            loading={saving}
            className="type-body font-semibold text-brand-ink"
            data-testid="cart-line-total"
          >
            {line.total}
          </Amount>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <p className="type-small text-brand-ink-muted" data-testid="cart-line-meta">
            {sizeWords && <span>{sizeWords} · </span>}
            {fillParts(words.each, { price: <Amount>{line.unitPrice}</Amount> }).map(
              (part, index) => (
                <Fragment key={index}>{part}</Fragment>
              )
            )}
          </p>

          {line.fitKit && (
            <div className="flex flex-col type-small text-brand-ink-muted md:basis-full">
              <p className="font-semibold text-brand-ink">{productContent.fitKit.deposit}</p>
              {exportRegion && <p>{cartContent.minimum.notCounted}</p>}
            </div>
          )}

          <div className="flex items-start justify-between gap-3 md:gap-4">
            <QuantityStepper
              value={quantity}
              onChange={change}
              onBlur={saveNow}
              max={line.maxQuantity}
              label={fill(line.size ? words.quantityLabel : words.quantityLabelNoSize, named)}
              decreaseLabel={words.decrease}
              increaseLabel={words.increase}
              rangeMessage={fill(words.quantityRange, { max: line.maxQuantity })}
              ignorePresses={saving || removing}
              describedBy={error?.kind === "quantity" ? errorId : undefined}
            />
            <button
              type="button"
              onClick={remove}
              aria-disabled={removing || undefined}
              aria-label={fill(line.size ? words.removeLabel : words.removeLabelNoSize, named)}
              className="inline-flex min-h-[44px] items-center gap-1.5 px-1 type-small font-semibold text-brand-ink underline decoration-1 underline-offset-4 hover:decoration-2 aria-disabled:cursor-not-allowed"
              data-testid="cart-line-remove"
            >
              <LineIcon name="trash" className="h-5 w-5" />
              {words.remove}
            </button>
          </div>
        </div>

        {error && (
          <FieldError
            id={errorId}
            data-testid="cart-line-error"
            action={
              <button
                type="button"
                onClick={retry}
                className="min-h-[44px] px-1 type-small font-semibold text-brand-ink underline underline-offset-4"
              >
                {words.tryAgain}
              </button>
            }
          >
            {error.kind === "quantity" ? words.quantityError : words.removeError}
          </FieldError>
        )}
      </div>
    </li>
  )
}

export default CartLine
