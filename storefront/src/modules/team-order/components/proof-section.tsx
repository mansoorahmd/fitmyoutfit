import { proofContent } from "@content/proof"
import { designOrderPath } from "@lib/editor/designer-context"
import { dayOfMoment, momentWords, proofGate } from "@lib/team-order/proof"
import type { ProofView, TeamOrderView } from "@lib/team-order/types"
import { fill } from "@lib/util/wording"
import { ButtonLink } from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import MakeProofButton from "./make-proof-button"
import ReopenButton from "./reopen-button"

const w = proofContent

/**
 * The proof, on the team-order page: the button that makes it (only when the backend would accept it; otherwise
 * one sentence says what is missing, so there is never a dead button), a link to the proof that is out or signed,
 * what comes next in one line, "Change the list", and every proof ever made with its state.
 */
export default function ProofSection({
  order,
  proofs,
  countryCode,
  designerHandle,
}: {
  order: TeamOrderView
  /** Every proof of the order, newest first; null when they could not be read (the section says the rest without them). */
  proofs: ProofView[] | null
  countryCode: string
  designerHandle: string | null
}) {
  const gate = proofGate(order)
  const current = order.currentProof
  const proofHref = `/account/team-orders/${encodeURIComponent(order.id)}/proof`
  // after going back to a draft, the designer is where the list is edited again
  const afterReopen = designerHandle
    ? `/${countryCode}${designOrderPath(designerHandle, order.id)}`
    : `/${countryCode}/account/team-orders/${encodeURIComponent(order.id)}`

  return (
    <section className="flex flex-col gap-4" aria-labelledby="team-order-proof-title" data-testid="proof-section" data-status={order.status}>
      <h2 id="team-order-proof-title" className="type-h2">
        {w.make.title}
      </h2>

      {gate.kind === "ready" && (
        <>
          <p className="type-body" data-testid="proof-ready">
            {w.make.ready}
          </p>
          <MakeProofButton orderId={order.id} countryCode={countryCode} />
        </>
      )}
      {gate.kind === "blocked" && (
        <p className="type-body" data-testid="proof-blocked" data-reason={gate.reason}>
          {gate.sentence}
        </p>
      )}

      {order.status === "proof_sent" && current && (
        <>
          <p className="type-body" data-testid="proof-out">
            {w.make.out}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href={proofHref} fullWidth className="md:w-auto" data-testid="proof-open">
              {w.make.open}
            </ButtonLink>
            <ReopenButton orderId={order.id} signed={false} afterHref={afterReopen} variant="text" />
          </div>
        </>
      )}

      {order.status !== "draft" && order.status !== "proof_sent" && current && (
        <>
          <p className="type-body" data-testid="proof-signed">
            {fill(w.make.signed, { date: dayOfMoment(current.signedAt) ?? "" })}
          </p>
          {order.status === "approved" && (
            <p className="type-body font-semibold" data-testid="proof-next">
              {w.make.next}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href={proofHref} variant="secondary" fullWidth className="md:w-auto" data-testid="proof-open">
              {w.make.openSigned}
            </ButtonLink>
            {order.status === "approved" && <ReopenButton orderId={order.id} signed afterHref={afterReopen} variant="text" />}
          </div>
        </>
      )}

      {proofs && proofs.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="proof-history">
          <h3 className="type-h3">{w.history.title}</h3>
          <ul className="flex flex-col gap-2">
            {proofs.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 rounded-control border border-brand-border-strong p-3" data-testid="proof-history-item" data-status={p.status} data-proof={p.number}>
                <p className="type-body font-semibold">
                  {fill(w.history.label, { number: p.number })} · {w.history.status[p.status]}
                  {current?.id === p.id ? ` · ${w.history.current}` : ""}
                </p>
                <p className="type-small text-brand-ink-muted">
                  {fill(w.history.made, { date: dayOfMoment(p.createdAt) ?? "" })}
                  {p.signedName && p.signedAt ? (
                    <>
                      {" · "}
                      {fill(w.history.signedBy, { name: `⁨${p.signedName}⁩`, date: momentWords(p.signedAt) ?? "" })}
                    </>
                  ) : null}
                  {p.closedAt && (p.status === "withdrawn" || p.status === "replaced") ? ` · ${fill(w.history.closed, { date: dayOfMoment(p.closedAt) ?? "" })}` : ""}
                </p>
                <LocalizedClientLink
                  href={`${proofHref}/${encodeURIComponent(p.id)}`}
                  className="min-h-[44px] self-start py-2 font-semibold underline underline-offset-4"
                  data-testid="proof-history-open"
                >
                  {w.history.open}
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
