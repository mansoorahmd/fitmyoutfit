import { clx } from "@medusajs/ui"

import type { TeamOrderStatus } from "@lib/team-order/types"
import { statusWords } from "@lib/team-order/words"
import LineIcon, { type LineIconName } from "@modules/home/components/line-icon"

const ICON: Record<TeamOrderStatus, LineIconName> = {
  draft: "ruler",
  proof_sent: "package",
  approved: "check",
  deposit_paid: "check",
  in_production: "package",
  balance_due: "alert",
  shipped: "check",
}

/** The status of a team order: an icon and plain words, never colour alone (like the order's status). */
export default function TeamOrderStatusChip({ status, className }: { status: TeamOrderStatus; className?: string }) {
  return (
    <span
      className={clx("inline-flex items-center gap-1.5 type-small font-semibold text-brand-ink", className)}
      data-testid="team-order-status"
      data-status={status}
    >
      <LineIcon name={ICON[status]} className="h-5 w-5 shrink-0" />
      <span>{statusWords(status).label}</span>
    </span>
  )
}
