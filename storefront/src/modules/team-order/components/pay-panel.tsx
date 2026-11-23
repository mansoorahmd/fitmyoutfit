"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { paymentsContent } from "@content/payments"
import { completePayment, retrievePayments, startPayment } from "@lib/data/team-order-payments"
import { guarded } from "@lib/team-order/guarded"
import {
  PLACEHOLDER_PROVIDER,
  moneyWords,
  paymentFailure,
  payModel,
  type PartName,
  type PaymentFailure,
  type PaymentsView,
  type StartedPayment,
} from "@lib/team-order/payments"
import { dayOfMoment, momentWords } from "@lib/team-order/proof"
import type { Failure, Outcome } from "@lib/team-order/types"
import { statusWords } from "@lib/team-order/words"
import { authHref } from "@lib/util/account-auth"
import { fill } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import { Alert } from "@modules/common/components/alert"
import { Button, ButtonLink } from "@modules/common/components/button"

const w = paymentsContent.pay

type Phase =
  | { kind: "idle" }
  | { kind: "starting"; part: PartName }
  /** Started: the placeholder payment waits for its confirmation (the contract's `next: confirm`). */
  | { kind: "confirm"; started: StartedPayment }
  | { kind: "completing"; started: StartedPayment }
  /** The completing request got no answer: nobody knows if the money was taken. Never "paid", never "pay again". */
  | { kind: "unsure"; started: StartedPayment; checking: boolean; message: string | null }
  /** A payment method this page does not know. */
  | { kind: "unknown_next" }
  | { kind: "redirecting" }
  | { kind: "done"; part: PartName }

const safe = {
  start: guarded(startPayment),
  complete: guarded(completePayment),
  read: guarded(retrievePayments),
}

/**
 * The payment page's one panel: what is due now and the action, in the shape of the contract: `start`, then
 * what `next` says (`confirm` for the placeholder payment: a plain confirmation marked as a test, in which no
 * money moves; `redirect` for a gateway that sends the organizer away and back; any other type is "not
 * available here yet", never a crash), then `complete`. A second press while a request is on its way does
 * nothing, and the backend pays once whatever arrives. If the completing request gets no answer, the page asks
 * the store what it knows and never says "paid" or "pay again" on a guess.
 */
export default function PayPanel({
  orderId,
  teamName,
  initial,
  orderHref,
  proofHref,
  payPath,
}: {
  orderId: string
  teamName: string
  initial: PaymentsView
  /** The team-order page (a path without the country code). */
  orderHref: string
  proofHref: string
  /** This page's own path with the country code, for coming back after signing in again. */
  payPath: string
}) {
  const router = useRouter()
  const [money, setMoney] = useState<PaymentsView>(initial)
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [error, setError] = useState<PaymentFailure | null>(null)
  // a second press while a request is on its way (or after the payment worked) does nothing
  const busy = useRef(false)
  const [notPaid, setNotPaid] = useState(false)

  const currency = money.cost.currencyCode
  const m = (n: number) => moneyWords(n, currency)
  const model = payModel(money.teamOrder.status, money)

  const fail = (f: Failure, step: "start" | "complete" | "load"): PaymentFailure => {
    const out = paymentFailure(step, f)
    setError(out)
    return out
  }

  const finish = (next: PaymentsView, part: PartName) => {
    setMoney(next)
    setError(null)
    setPhase({ kind: "done", part })
    // the page's own copy of the order (its status, the figures) is read again, and this panel keeps what it shows
    router.refresh()
  }

  /** Asks the store what it knows now (after a refusal that says it is paid, or an answer that did not arrive); null: no answer. */
  const readMoney = async (): Promise<PaymentsView | null> => {
    const read: Outcome<PaymentsView> = await safe.read(orderId)
    if (!read.ok) return null
    setMoney(read.value)
    return read.value
  }

  const start = async (part: PartName) => {
    if (busy.current) return
    busy.current = true
    setError(null)
    setNotPaid(false)
    setPhase({ kind: "starting", part })
    const result = await safe.start(orderId, part)
    if (!result.ok) {
      const out = fail(result.failure, "start")
      setPhase({ kind: "idle" })
      if (out.alreadyPaid) {
        const known = await readMoney()
        if (known && known[part].state === "paid") finish(known, part)
      }
      busy.current = false
      return
    }
    const started = result.value
    setMoney(started.payments)
    switch (started.next.type) {
      case "confirm":
        setPhase({ kind: "confirm", started })
        busy.current = false
        return
      case "redirect":
        // a gateway: away and back; the complete route is called on the way back (not built yet: no gateway exists)
        setPhase({ kind: "redirecting" })
        window.location.assign(started.next.url)
        return
      default:
        setPhase({ kind: "unknown_next" })
        busy.current = false
    }
  }

  const complete = async (started: StartedPayment) => {
    if (busy.current) return
    busy.current = true
    setError(null)
    setNotPaid(false)
    setPhase({ kind: "completing", started })
    const result = await safe.complete(orderId, started.part, started.session.id)
    if (result.ok) {
      finish(result.value, started.part)
      return
    }
    const out = fail(result.failure, "complete")
    if (out.unavailable) {
      // no answer: it is not known whether the payment was taken
      setError(null)
      setPhase({ kind: "unsure", started, checking: false, message: null })
      busy.current = false
      return
    }
    if (out.alreadyPaid) {
      // paid, by this press or an earlier one: said as paid, once
      const known = await readMoney()
      if (known && known[started.part].state === "paid") {
        finish(known, started.part)
        return
      }
    }
    // a refusal: nothing was taken; the part may be started again (a stale session) or confirmed again
    setPhase(out.startAgain || out.alreadyPaid || out.notFound || out.signedOut ? { kind: "idle" } : { kind: "confirm", started })
    busy.current = false
  }

  const checkAgain = async (started: StartedPayment) => {
    if (busy.current) return
    busy.current = true
    setPhase({ kind: "unsure", started, checking: true, message: null })
    const known = await readMoney()
    if (known && known[started.part].state === "paid") {
      finish(known, started.part)
      return
    }
    if (known) {
      setError(null)
      setNotPaid(true)
      setPhase({ kind: "confirm", started })
    } else {
      setPhase({ kind: "unsure", started, checking: false, message: w.unsure.stillUnsure })
    }
    busy.current = false
  }

  const checkProcessing = async () => {
    if (busy.current) return
    busy.current = true
    const read = await safe.read(orderId)
    if (read.ok) {
      setMoney(read.value)
      router.refresh()
    } else {
      fail(read.failure, "load")
    }
    busy.current = false
  }

  const part: PartName | null = model.kind === "pay" ? model.part : null
  const done = phase.kind === "done" ? phase.part : null
  const heading =
    done ? w.titleDone : model.kind === "pay" ? (model.part === "deposit" ? w.titleDeposit : w.titleBalance) : model.kind === "paid_in_full" ? w.paidInFull.title : w.titleDone

  const figures = (
    <dl className="flex flex-col gap-2 rounded-control bg-brand-surface-alt p-3 type-body" data-testid="pay-figures">
      {part && !done && (
        <div className="flex items-baseline justify-between gap-4 font-semibold" data-testid="pay-due">
          <dt>{w.dueNow}</dt>
          <dd>
            <Amount>{m(money[part].amount)}</Amount>
          </dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4" data-testid="pay-total">
        <dt>{w.total}</dt>
        <dd>
          <Amount>{m(money.cost.total)}</Amount>
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4" data-testid="pay-paid">
        <dt>{w.paid}</dt>
        <dd>
          <Amount>{m(money.paidTotal)}</Amount>
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4" data-testid="pay-outstanding">
        <dt>{w.outstanding}</dt>
        <dd>
          <Amount>{m(money.outstanding)}</Amount>
        </dd>
      </div>
      {money.order?.displayId != null && (
        <div className="flex items-baseline justify-between gap-4" data-testid="pay-order-number">
          <dt>{paymentsContent.order.figures.order}</dt>
          <dd>#{money.order.displayId}</dd>
        </div>
      )}
    </dl>
  )

  const testNotice = (started: StartedPayment) =>
    started.session.providerId === PLACEHOLDER_PROVIDER ? (
      <Alert variant="info" title={w.test.title} data-testid="pay-test-notice">
        <p>{w.test.text}</p>
      </Alert>
    ) : null

  const errorAlert = error && (
    <Alert variant="error" announce data-testid="pay-error">
      <div className="flex flex-col gap-2">
        <p>{error.text}</p>
        {error.signedOut && (
          <p>
            <a className="font-semibold underline underline-offset-4" href={authHref("signin", { next: payPath })}>
              {paymentsContent.general.signedOut}
            </a>
          </p>
        )}
      </div>
    </Alert>
  )

  return (
    <div className="flex max-w-[560px] flex-col gap-6" data-testid="pay-panel" data-phase={phase.kind} data-model={model.kind}>
      <header className="flex flex-col gap-1">
        <h1 className="type-h1" data-testid="pay-title">
          {heading}
        </h1>
        <p className="type-body text-brand-ink-muted" dir="auto">
          <bdi>{teamName}</bdi>
        </p>
      </header>

      {phase.kind === "done" ? (
        <section className="flex flex-col gap-3 rounded-card border-2 border-brand-success bg-brand-success-surface p-4 md:p-6" data-testid="pay-done" data-part={phase.part}>
          <h2 className="type-h2">{phase.part === "deposit" ? w.done.deposit.title : w.done.balance.title}</h2>
          <p className="type-body" data-testid="pay-done-text">
            {fill(phase.part === "deposit" ? w.done.deposit.text : w.done.balance.text, {
              amount: m(money[phase.part].amount),
              when: momentWords(money[phase.part].paidAt) ?? dayOfMoment(money[phase.part].paidAt) ?? "",
            })}
          </p>
          {phase.part === "deposit" && (
            <p className="type-body" data-testid="pay-done-status">
              {fill(w.done.order, { status: statusWords(money.teamOrder.status).label })}
            </p>
          )}
          <p className="type-body font-semibold" data-testid="pay-done-next">
            {phase.part === "deposit" ? w.done.nextAfterDeposit : w.done.nextAfterBalance}
          </p>
          <div>
            <ButtonLink href={orderHref} fullWidth className="md:w-auto" data-testid="pay-done-open">
              {w.done.open}
            </ButtonLink>
          </div>
        </section>
      ) : (
        <>
          {model.kind === "pay" && figures}
          {errorAlert}

          {model.kind === "pay" && (phase.kind === "idle" || phase.kind === "starting") && (
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => start(model.part)}
                isLoading={phase.kind === "starting"}
                loadingText={w.starting}
                fullWidth
                className="md:w-auto md:self-start"
                data-testid="pay-start"
              >
                {fill(model.part === "deposit" ? w.payDeposit : w.payBalance, { amount: m(money[model.part].amount) })}
              </Button>
            </div>
          )}

          {(phase.kind === "confirm" || phase.kind === "completing") && (
            <div className="flex flex-col gap-4" data-testid="pay-confirm">
              {testNotice(phase.started)}
              {notPaid && (
                <Alert variant="info" data-testid="pay-not-paid">
                  <p>{w.unsure.notPaid}</p>
                </Alert>
              )}
              <Button
                onClick={() => complete(phase.started)}
                isLoading={phase.kind === "completing"}
                loadingText={w.confirming}
                fullWidth
                className="md:w-auto md:self-start"
                data-testid="pay-confirm-button"
              >
                {fill(w.confirmTest, { amount: m(phase.started.amount) })}
              </Button>
            </div>
          )}

          {phase.kind === "unsure" && (
            <Alert variant="error" title={w.unsure.title} data-testid="pay-unsure">
              <div className="flex flex-col gap-3">
                <p>{w.unsure.text}</p>
                {phase.message && <p>{phase.message}</p>}
                <div>
                  <Button variant="secondary" onClick={() => checkAgain(phase.started)} isLoading={phase.checking} loadingText={w.confirming} data-testid="pay-check-again">
                    {w.unsure.action}
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {phase.kind === "unknown_next" && (
            <Alert variant="info" data-testid="pay-unknown-next">
              <div className="flex flex-col gap-2">
                <p>{w.unknownNext}</p>
                <p>
                  <ButtonLink href={orderHref} variant="secondary">
                    {w.unknownNextAction}
                  </ButtonLink>
                </p>
              </div>
            </Alert>
          )}

          {phase.kind === "redirecting" && (
            <p className="type-body" role="status" data-testid="pay-redirecting">
              {w.redirecting}
            </p>
          )}

          {model.kind !== "pay" && <StateNote model={model} money={money} orderHref={orderHref} proofHref={proofHref} onCheck={checkProcessing} figures={figures} />}
        </>
      )}

    </div>
  )
}

function StateNote({
  model,
  money,
  orderHref,
  proofHref,
  onCheck,
  figures,
}: {
  model: ReturnType<typeof payModel>
  money: PaymentsView
  orderHref: string
  proofHref: string
  onCheck: () => void
  figures: React.ReactNode
}) {
  const m = (n: number) => moneyWords(n, money.cost.currencyCode)
  switch (model.kind) {
    case "not_priced":
      return (
        <div className="flex flex-col gap-3" data-testid="pay-state" data-state="not_priced">
          <p className="type-body font-semibold">{w.notPriced.title}</p>
          <p className="type-body">{w.notPriced.text}</p>
          <div>
            <ButtonLink href={orderHref} variant="secondary">
              {w.notPriced.action}
            </ButtonLink>
          </div>
        </div>
      )
    case "proof_out":
      return (
        <div className="flex flex-col gap-3" data-testid="pay-state" data-state="proof_out">
          <p className="type-body font-semibold">{w.proofOut.title}</p>
          <p className="type-body">{w.proofOut.text}</p>
          <div>
            <ButtonLink href={proofHref} variant="secondary">
              {w.proofOut.action}
            </ButtonLink>
          </div>
        </div>
      )
    case "balance_not_due":
      return (
        <div className="flex flex-col gap-3" data-testid="pay-state" data-state="balance_not_due">
          <p className="type-body font-semibold">{w.balanceNotDue.title}</p>
          <p className="type-body">{fill(w.balanceNotDue.text, { amount: m(money.balance.amount) })}</p>
          <p className="type-body">{model.production ? w.inProduction : w.depositPaidNext}</p>
          {figures}
        </div>
      )
    case "paid_in_full":
      return (
        <div className="flex flex-col gap-3" data-testid="pay-state" data-state="paid_in_full">
          <p className="type-body">{fill(w.paidInFull.text, { total: m(money.cost.total) })}</p>
          {model.shipped && <p className="type-body">{w.shipped}</p>}
          {figures}
        </div>
      )
    case "processing":
      return (
        <div className="flex flex-col gap-3" data-testid="pay-state" data-state="processing">
          <p className="type-body font-semibold">{w.processing.title}</p>
          <p className="type-body">{w.processing.text}</p>
          <div>
            <Button variant="secondary" onClick={onCheck} data-testid="pay-processing-check">
              {w.processing.action}
            </Button>
          </div>
          {figures}
        </div>
      )
    case "refunded":
      return (
        <p className="type-body" data-testid="pay-state" data-state="refunded">
          {w.refunded}
        </p>
      )
    case "canceled":
      return (
        <p className="type-body" data-testid="pay-state" data-state="canceled">
          {w.canceled}
        </p>
      )
    default:
      return (
        <div className="flex flex-col gap-3" data-testid="pay-state" data-state="nothing_due">
          <p className="type-body">{w.nothingDue}</p>
          {figures}
        </div>
      )
  }
}
