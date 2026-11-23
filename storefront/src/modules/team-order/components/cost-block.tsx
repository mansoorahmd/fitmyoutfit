import { paymentsContent } from "@content/payments"
import { costBlock, type PaymentsView } from "@lib/team-order/payments"
import Amount from "@modules/common/components/amount"

const w = paymentsContent.cost

function Row({ label, value, note, testId }: { label: string; value: string | null; note?: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4" data-testid={testId}>
      <dt className="min-w-0">
        <bdi>{label}</bdi>
        {note && <span className="block type-small text-brand-ink-muted">{note}</span>}
      </dt>
      <dd className="shrink-0">{value && /\d/.test(value) ? <Amount>{value}</Amount> : value}</dd>
    </div>
  )
}

/**
 * What the team order costs, as the backend priced it (docs/contracts/m3-team-order-payments.md, section 3):
 * a line per size, delivery (the duty-paid line in words), the rush charge when there is one, tax as the store
 * shows it ("Tax not final" while it is not), the total, and the split: the deposit after signing and the
 * balance before shipping. A plain component: every figure is the backend's, formatted in the region's
 * currency; nothing is added up here.
 */
export default function CostBlock({ money }: { money: Pick<PaymentsView, "cost" | "deposit" | "balance"> }) {
  const block = costBlock(money)

  return (
    <section
      className="fmo-no-print flex flex-col gap-4 rounded-card border border-brand-border-strong p-4 md:p-6"
      aria-labelledby="cost-title"
      data-testid="cost-block"
      data-state={money.cost.state}
    >
      <div className="flex flex-col gap-1">
        <h2 id="cost-title" className="type-h2">
          {w.title}
        </h2>
        <p className="type-small text-brand-ink-muted">{money.cost.state === "quote" ? w.intro : w.introOrdered}</p>
      </div>

      <dl className="flex flex-col gap-3">
        {block.lines.map((l) => (
          <Row key={l.key} label={l.label} value={l.value} testId={l.testId} />
        ))}
        <div className="flex justify-between gap-4 type-small text-brand-ink-muted" data-testid="cost-pieces">
          <dt>{block.piecesText}</dt>
          <dd />
        </div>
        {block.extras.map((r) => (
          <Row key={r.key} label={r.label} value={r.value} note={r.note} testId={r.testId} />
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-brand-border pt-3 type-h3" data-testid="cost-total">
          <dt>{w.total}</dt>
          <dd>
            <Amount>{block.total}</Amount>
          </dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-3 rounded-control bg-brand-surface-alt p-3">
        <div className="flex items-baseline justify-between gap-4" data-testid="cost-deposit">
          <dt className="min-w-0">
            <span className="font-semibold">{w.deposit}</span>
            <span className="block type-small text-brand-ink-muted">{block.deposit.hint}</span>
          </dt>
          <dd className="shrink-0 font-semibold">
            <Amount>{block.deposit.amount}</Amount>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4" data-testid="cost-balance">
          <dt className="min-w-0">
            <span className="font-semibold">{w.balance}</span>
            <span className="block type-small text-brand-ink-muted">{block.balance.hint}</span>
          </dt>
          <dd className="shrink-0 font-semibold">
            <Amount>{block.balance.amount}</Amount>
          </dd>
        </div>
      </dl>
    </section>
  )
}
