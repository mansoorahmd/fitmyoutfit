import Image from "next/image"

import { paymentsContent } from "@content/payments"
import { teamOrderContent } from "@content/team-order"
import type { TeamOrderListItem } from "@lib/team-order/types"
import { dayWords, piecesWords, playersWords } from "@lib/team-order/words"
import { fill } from "@lib/util/wording"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import TeamOrderStatusChip from "./team-order-status"

const words = teamOrderContent.list.card

/**
 * One team order in the list: team name, product, players and pieces, the status in plain words and the need-by date.
 * The whole card is one link to the order (one focus ring), as the order cards are.
 */
export default function TeamOrderCard({
  order,
  productName,
  thumbnail,
}: {
  order: TeamOrderListItem
  productName: string
  thumbnail: string | null
}) {
  return (
    <LocalizedClientLink
      href={`/account/team-orders/${encodeURIComponent(order.id)}`}
      className="flex gap-4 rounded-card border border-brand-border-strong bg-white p-4 text-brand-ink transition-colors duration-150 ease-out hover:border-brand-ink focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
      data-testid="team-order-card"
      data-order-id={order.id}
    >
      {thumbnail && (
        <span className="relative block h-[72px] w-14 shrink-0 overflow-hidden rounded-control bg-brand-surface-alt" aria-hidden="true">
          <Image src={thumbnail} alt="" fill sizes="56px" quality={50} className="object-contain" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <h2 className="type-h3 min-w-0 break-words" dir="auto" data-testid="team-order-card-name">
            <bdi>{order.teamName}</bdi>
          </h2>
          <TeamOrderStatusChip status={order.status} />
        </span>
        <span className="type-small text-brand-ink-muted" dir="auto">
          <bdi>{productName}</bdi>
        </span>
        <span className="type-small text-brand-ink-muted" data-testid="team-order-card-meta">
          {playersWords(order.players)} · {piecesWords(order.pieces)}
        </span>
        <span className="type-small font-semibold text-brand-ink" data-testid="team-order-card-money">
          {paymentsContent.card.money[order.status]}
        </span>
        <span className="type-small text-brand-ink-muted" data-testid="team-order-card-need-by">
          {order.needByDate ? fill(words.needBy, { date: dayWords(order.needByDate) }) : words.noNeedBy}
        </span>
      </span>
    </LocalizedClientLink>
  )
}
