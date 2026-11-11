"use client"

import { clx } from "@medusajs/ui"
import Image from "next/image"
import React, { Fragment } from "react"

import { cartContent } from "@content/cart"
import { AddedToCartView } from "@lib/util/added-to-cart"
import { countWords, fill, fillParts } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import { Button, ButtonLink } from "@modules/common/components/button"
import GarmentOutline from "@modules/common/icons/garment-outline"
import LineIcon from "@modules/home/components/line-icon"

import MinimumProgress from "../minimum-progress"

type AddedToCartProps = {
  view: AddedToCartView
  /** "popover" (header, from 1024 px) or "inline" (product page, below). */
  variant: "popover" | "inline"
  /** "Keep shopping", the close button and Esc. */
  onClose: () => void
  className?: string
}

/**
 * "Added to your cart" (docs/design/05-m1-pages.md, 4.7), the same content
 * in both places: the heading (announced), the line just added, the cart in
 * one line, the minimum in export regions, then "View cart" and "Keep
 * shopping". No checkout button: the cart is where the minimum and the
 * totals are checked. The popover has a close button; the inline box is a
 * success alert that stays until the next add or a page change.
 */
const AddedToCart = ({ view, variant, onClose, className }: AddedToCartProps) => {
  const words = cartContent.added
  const popover = variant === "popover"

  return (
    <section
      aria-label={words.title}
      className={clx(
        "flex flex-col gap-4 rounded-card p-4 text-brand-ink",
        popover
          ? "border border-brand-border-strong bg-brand-surface shadow-[0_8px_24px_rgb(var(--c-ink)_/_0.16)]"
          : "border-s-4 border-brand-success bg-brand-success-surface",
        className
      )}
      data-testid={popover ? "added-popover" : "added-inline"}
    >
      <div className="flex items-start justify-between gap-2">
        <p role="status" className="flex items-center gap-2 type-body font-semibold">
          <LineIcon name="check" className="h-6 w-6 shrink-0 text-brand-success" />
          {words.title}
        </p>
        {popover && (
          <button
            type="button"
            onClick={onClose}
            aria-label={words.close}
            className="-my-2.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-brand-surface-alt"
            data-testid="added-close"
          >
            <LineIcon name="x" className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[56px_1fr] gap-3" data-testid="added-line">
        <span className="relative block h-[70px] w-14 overflow-hidden rounded-control bg-brand-surface-alt">
          {view.thumbnail ? (
            <Image src={view.thumbnail} alt="" fill sizes="56px" quality={50} className="object-contain" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <GarmentOutline className="w-1/2 text-brand-border-strong" />
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 type-body font-semibold" dir="auto">
              <bdi>{view.title}</bdi>
            </p>
            <Amount className="type-body font-semibold">{view.amount}</Amount>
          </div>
          <p className="type-small text-brand-ink-muted">
            {view.size && <span>{fill(cartContent.line.size, { size: view.size })} · </span>}
            {fill(words.times, { quantity: view.quantity })}
          </p>
        </div>
      </div>

      <p className="type-small text-brand-ink" data-testid="added-summary">
        {fillParts(words.summary, {
          pieces: countWords(view.pieces, cartContent.pieces),
          total: <Amount>{view.total}</Amount>,
        }).map((part, index) => (
          <Fragment key={index}>{part}</Fragment>
        ))}
      </p>

      {view.minimum && <MinimumProgress minimum={view.minimum} compact />}

      <div className="flex flex-col items-stretch gap-1">
        {/* Secondary, not red: "Add to cart" right above is the view's one main action. */}
        <ButtonLink href="/cart" variant="secondary" fullWidth data-testid="added-view-cart">
          {words.viewCart}
        </ButtonLink>
        <Button variant="text" onClick={onClose} className="self-center" data-testid="added-keep-shopping">
          {words.keepShopping}
        </Button>
      </div>
    </section>
  )
}

export default AddedToCart
