import { paymentsContent } from "@content/payments"
import { dayOfMoment } from "@lib/team-order/proof"
import { moneyKey, moneyWords, payModel, type PaymentsView } from "@lib/team-order/payments"
import type { TeamOrderStatus } from "@lib/team-order/types"
import { fill } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import { ButtonLink } from "@modules/common/components/button"

const w = paymentsContent.order

function Figure({ label, value, note, testId }: { label: string; value: string; note?: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4" data-testid={testId}>
      <dt className="min-w-0">
        {label}
        {note && <span className="block type-small text-brand-ink-muted">{note}</span>}
      </dt>
      <dd className="shrink-0">
        <Amount>{value}</Amount>
      </dd>
    </div>
  )
}

/**
 * The money of a team order on its page, at every status, in plain words and with a button only where the
 * backend would take a payment: not priced yet (no proof), priced (proof out), deposit due, deposit paid,
 * in production, balance due, paid in full, shipped. Amounts are the backend's (`money`); when they could not
 * be read the section says so and claims nothing.
 */
export default function MoneySection({
  orderId,
  status,
  money,
  failed,
}: {
  orderId: string
  status: TeamOrderStatus
  /** The backend's money; null for a draft (nothing to price) or when it could not be read (`failed`). */
  money: PaymentsView | null
  failed: boolean
}) {
  const key = moneyKey(status, money)
  const state = w.state[key]
  const m = (n: number) => (money ? moneyWords(n, money.cost.currencyCode) : "")
  const model = payModel(status, money)
  const payHref = `/account/team-orders/${encodeURIComponent(orderId)}/pay`
  const showFigures = money && status !== "draft" && status !== "proof_sent"

  return (
    <section className="flex flex-col gap-3" aria-labelledby="team-order-money-title" data-testid="money-section" data-status={status} data-money={key}>
      <h2 id="team-order-money-title" className="type-h2">
        {w.title}
      </h2>

      {failed && !money ? (
        <p className="type-body" data-testid="money-failed">
          {w.failed.text}
        </p>
      ) : (
        <>
          <p className="type-body font-semibold" data-testid="money-title">
            {state.title}
          </p>
          <p className="type-body" data-testid="money-text">
            {money
              ? fill(state.text, {
                  amount: m(status === "approved" || status === "deposit_paid" ? money.deposit.amount : money.balance.amount),
                  total: m(money.cost.total),
                })
              : state.text}
          </p>

          {showFigures && (
            <dl className="flex flex-col gap-2 rounded-control bg-brand-surface-alt p-3 type-body" data-testid="money-figures">
              <Figure label={w.figures.total} value={m(money.cost.total)} testId="money-total" />
              <Figure
                label={paymentsContent.pay.partDeposit}
                value={m(money.deposit.amount)}
                note={money.deposit.state === "paid" ? fill(paymentsContent.pay.partDepositPaid, { date: dayOfMoment(money.deposit.paidAt) ?? "" }) : undefined}
                testId="money-deposit"
              />
              <Figure
                label={paymentsContent.pay.partBalance}
                value={m(money.balance.amount)}
                note={money.balance.state === "paid" ? fill(paymentsContent.pay.partBalancePaid, { date: dayOfMoment(money.balance.paidAt) ?? "" }) : undefined}
                testId="money-balance"
              />
              <Figure label={w.figures.paid} value={m(money.paidTotal)} testId="money-paid" />
              <Figure label={w.figures.outstanding} value={m(money.outstanding)} testId="money-outstanding" />
              {money.order?.displayId != null && (
                <div className="flex justify-between gap-4" data-testid="money-order-number">
                  <dt>{w.figures.order}</dt>
                  <dd>#{money.order.displayId}</dd>
                </div>
              )}
            </dl>
          )}

          {money && model.kind === "pay" && money[model.part].state === "started" && (
            <p className="type-small text-brand-ink-muted" data-testid="money-started">
              {model.part === "deposit" ? w.started : w.startedBalance}
            </p>
          )}
          {model.kind === "refunded" && (
            <p className="type-body" data-testid="money-refunded">
              {w.refunded}
            </p>
          )}
          {model.kind === "canceled" && (
            <p className="type-body" data-testid="money-canceled">
              {w.canceled}
            </p>
          )}
          {model.kind === "processing" && (
            <p className="type-body" data-testid="money-processing">
              {paymentsContent.pay.processing.text}
            </p>
          )}

          {model.kind === "pay" && (
            <div>
              <ButtonLink href={payHref} fullWidth className="md:w-auto" data-testid="money-pay">
                {model.part === "deposit" ? w.payDeposit : w.payBalance}
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </section>
  )
}
