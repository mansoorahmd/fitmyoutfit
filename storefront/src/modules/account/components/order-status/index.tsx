import { clx } from "@medusajs/ui"

import { OrderStatusView } from "@lib/util/account-orders"
import LineIcon from "@modules/home/components/line-icon"

const TONE: Record<OrderStatusView["tone"], string> = {
  muted: "text-brand-ink-muted",
  ink: "text-brand-ink",
  success: "text-brand-success",
}

/**
 * An order's status (docs/design/05-m1-pages.md, 9.3, `OrderStatus`): an
 * icon and words, never colour alone.
 */
const OrderStatus = ({ status, className }: { status: OrderStatusView; className?: string }) => (
  <span
    className={clx("inline-flex items-center gap-1.5 type-small font-semibold", TONE[status.tone], className)}
    data-testid="order-status"
    data-status={status.kind}
  >
    <LineIcon name={status.icon} className="h-5 w-5 shrink-0" />
    <span>{status.label}</span>
  </span>
)

export default OrderStatus
