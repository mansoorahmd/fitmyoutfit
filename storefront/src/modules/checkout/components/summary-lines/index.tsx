"use client"

import { clx } from "@medusajs/ui"
import Image from "next/image"

import { SummaryLineView } from "@lib/util/checkout-view"
import { fill } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import GarmentOutline from "@modules/common/icons/garment-outline"

export type SummaryLinesWords = { size: string; times: string }

/**
 * Order lines without controls (docs/design/05-m1-pages.md, 6.3 and 6.5 c,
 * and the confirmation, 7.1): a 56 × 70 thumbnail (left out when
 * `compact`), the title, "Size: M", "× 4" and the amount.
 */
const SummaryLines = ({
  lines,
  words,
  compact = false,
  className,
  "data-testid": dataTestId,
}: {
  lines: SummaryLineView[]
  words: SummaryLinesWords
  compact?: boolean
  className?: string
  "data-testid"?: string
}) => (
  <ul className={clx("flex flex-col gap-3", className)} data-testid={dataTestId ?? "summary-lines"}>
    {lines.map((line) => (
      <li key={line.id} className="flex items-start gap-3" data-testid="summary-line">
        {!compact && (
          <span className="relative block h-[70px] w-14 shrink-0 overflow-hidden rounded-control bg-brand-surface-alt">
            {line.thumbnail ? (
              <Image src={line.thumbnail} alt="" fill sizes="56px" quality={50} className="object-contain" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center">
                <GarmentOutline className="w-1/2 text-brand-border-strong" />
              </span>
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="type-body font-semibold text-brand-ink">{line.title}</bdi>
          <span className="type-small text-brand-ink-muted">
            {line.size && <span>{fill(words.size, { size: line.size })} · </span>}
            <span dir="ltr" className="whitespace-nowrap">{fill(words.times, { quantity: line.quantity })}</span>
          </span>
        </span>
        <Amount className="type-body text-brand-ink">{line.total}</Amount>
      </li>
    ))}
  </ul>
)

export default SummaryLines
