"use client"

import { clx } from "@medusajs/ui"
import React from "react"

import Spinner from "@modules/common/icons/spinner"

type RadioCardProps = {
  id: string
  name: string
  value: string
  checked: boolean
  onSelect: (value: string) => void
  title: React.ReactNode
  children?: React.ReactNode
  /** Shown, still focusable, but can't be chosen (cash on delivery over the limit). */
  inactive?: boolean
  /** A payment session is being started for this card: a spinner replaces the dot. */
  loading?: boolean
  /** Another card is loading: this one ignores presses meanwhile. */
  busy?: boolean
  describedBy?: string
  "data-testid"?: string
}

/**
 * A choice as a card (docs/design/05-m1-pages.md, 6.5 b): full width, at
 * least 64 px tall, 16 px padding, a 1 px `border-strong` outline and the
 * card radius; a 24 px radio circle at the start, then the title and the
 * text. The whole card is the label of a native radio, so arrow keys, Space
 * and screen readers work as they do for any radio group.
 * - Hover: `ink` outline. Focus: the ring round the card.
 * - Selected: 2 px `ink` outline and a filled dot.
 * - Inactive: `surface-alt` fill and `ink-muted` text, aria-disabled.
 * - Loading: a spinner in place of the dot.
 */
const RadioCard = ({
  id,
  name,
  value,
  checked,
  onSelect,
  title,
  children,
  inactive = false,
  loading = false,
  busy = false,
  describedBy,
  "data-testid": dataTestId,
}: RadioCardProps) => {
  const ignore = inactive || busy

  return (
    <label
      htmlFor={id}
      className={clx(
        "relative flex min-h-[64px] items-start gap-3 rounded-card p-4 transition-colors duration-150 ease-out",
        "has-[:focus-visible]:[outline-style:solid] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-focus",
        checked && !inactive
          ? "border-2 border-brand-ink p-[15px]"
          : "border border-brand-border-strong",
        inactive
          ? "cursor-not-allowed bg-brand-surface-alt text-brand-ink-muted"
          : clx("cursor-pointer bg-white text-brand-ink", !checked && "hover:border-brand-ink"),
        busy && !loading && "cursor-wait"
      )}
      data-testid={dataTestId}
      data-checked={checked ? "true" : "false"}
      data-inactive={inactive ? "true" : undefined}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        aria-disabled={ignore || undefined}
        aria-busy={loading || undefined}
        aria-describedby={describedBy}
        onChange={() => {
          if (!ignore) onSelect(value)
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={clx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
          inactive ? "border-brand-border-strong" : "border-brand-ink"
        )}
      >
        {loading ? (
          <Spinner size={16} aria-hidden="true" />
        ) : (
          checked && !inactive && <span className="h-3 w-3 rounded-full bg-brand-ink" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body font-semibold">{title}</span>
        {children && (
          <span className="type-small text-brand-ink-muted">
            {children}
          </span>
        )}
      </span>
    </label>
  )
}

export default RadioCard
