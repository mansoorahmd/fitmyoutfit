"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { proofContent } from "@content/proof"
import { signProof } from "@lib/data/team-orders"
import { authHref } from "@lib/util/account-auth"
import { checkSigning, stepFailure, type SigningSchedule } from "@lib/team-order/signing"
import type { ProofView, ScheduleState } from "@lib/team-order/types"
import { fill } from "@lib/util/wording"
import { Alert } from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import CheckField from "@modules/common/components/check-field"
import { TextField } from "@modules/common/components/text-field"

const w = proofContent.sign

/**
 * Signing under the proof: the statement the organizer agrees to, a field for their full name, one box to tick
 * and the button. The request carries the hash of the proof this page was built from and the need-by date's
 * state that was shown (`schedule.state`): if the list or the proof changed meanwhile the backend refuses, the
 * page says so and `onStale` makes it read the order again, so nothing is signed by accident. A second press
 * while the first is on its way does nothing (and the backend records a signature once, whatever arrives).
 */
export default function SignProof({
  orderId,
  proof,
  schedule,
  orderHref,
  signedInPath,
  onSigned,
  onStale,
}: {
  orderId: string
  proof: Pick<ProofView, "id" | "hash">
  schedule: SigningSchedule
  /** The team-order page (rush and the need-by date are chosen there). */
  orderHref: string
  /** This page's own path, for coming back after signing in again. */
  signedInPath: string
  onSigned: (proof: ProofView | null) => void
  onStale: (sentence: string) => void
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [ticked, setTicked] = useState(false)
  const [shown, setShown] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ text: string; signedOut: boolean } | null>(null)
  // a second press while the first request is on its way (or after it worked) does nothing
  const busy = useRef(false)

  const check = checkSigning({ name, ticked })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    if (!check.ok) {
      setShown(true)
      return
    }
    busy.current = true
    setPending(true)
    setFailure(null)
    let result
    try {
      result = await signProof(orderId, proof.id, {
        proofHash: proof.hash,
        signedName: check.name,
        confirmed: true,
        scheduleState: schedule.state as ScheduleState,
      })
    } catch {
      result = { ok: false as const, failure: { kind: "unavailable" as const } }
    }
    if (result.ok) {
      // stays locked: it is signed
      setPending(false)
      onSigned(result.value.currentProof)
      router.refresh()
      return
    }
    const step = stepFailure("sign", result.failure)
    setPending(false)
    busy.current = false
    setFailure({ text: step.text, signedOut: step.signedOut })
    if (step.refresh) {
      onStale(step.text)
      router.refresh()
    }
  }

  const nameError = shown && !check.ok && check.field === "name" ? check.sentence : undefined
  const tickError = shown && !check.ok && check.field === "tick" ? check.sentence : undefined

  return (
    <form className="fmo-no-print flex flex-col gap-5 rounded-card border border-brand-border-strong p-4 md:p-6" onSubmit={submit} noValidate data-testid="sign-form">
      <div className="flex flex-col gap-2">
        <h2 className="type-h2">{w.title}</h2>
        <p className="type-body text-brand-ink-muted">{w.intro}</p>
      </div>

      {schedule.sentences.length > 0 && (
        <Alert variant={schedule.state === "cannot_be_met" ? "error" : "info"} data-testid="sign-schedule">
          <div className="flex flex-col gap-2">
            {schedule.sentences.map((s) => (
              <p key={s}>{s}</p>
            ))}
            {schedule.state !== "ok" && schedule.state !== "none" && (
              <p>
                <a className="font-semibold underline underline-offset-4" href={orderHref} data-testid="sign-schedule-link">
                  {w.schedule.chooseDate}
                </a>
              </p>
            )}
          </div>
        </Alert>
      )}

      <p className="type-body rounded-control bg-brand-surface-alt p-3" data-testid="sign-statement">
        {w.statement}
      </p>

      <TextField
        id="sign-name"
        label={w.nameLabel}
        hint={w.nameHint}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        autoComplete="name"
        dir="auto"
        maxLength={400}
        data-testid="sign-name"
      />

      <div className="flex flex-col gap-1">
        <CheckField id="sign-tick" label={w.tickLabel} checked={ticked} onChange={setTicked} data-testid="sign-tick" />
        {tickError && (
          <p role="alert" className="type-small text-brand-error" data-testid="sign-tick-error">
            {tickError}
          </p>
        )}
      </div>

      {failure && (
        <Alert variant="error" announce data-testid="sign-failure">
          <div className="flex flex-col gap-2">
            <p>{failure.text}</p>
            {failure.signedOut && (
              <p>
                <a className="font-semibold underline underline-offset-4" href={`${authHref("signin", { next: signedInPath })}`}>
                  {proofContent.general.signedOut}
                </a>
              </p>
            )}
          </div>
        </Alert>
      )}

      <Button type="submit" isLoading={pending} loadingText={w.signing} fullWidth className="md:w-auto md:self-start" data-testid="sign-submit">
        {w.submit}
      </Button>
    </form>
  )
}

/** After signing: who signed and when (from the backend's answer), the lock, what comes next in one line, and no button for it. */
export function SignedPanel({
  proof,
  whenText,
  promisedText,
}: {
  proof: Pick<ProofView, "signedName">
  whenText: string
  promisedText: string | null
}) {
  const d = w.done
  return (
    <section className="fmo-no-print flex flex-col gap-3 rounded-card border-2 border-brand-success bg-brand-success-surface p-4 md:p-6" data-testid="signed-panel" aria-labelledby="signed-title">
      <h2 id="signed-title" className="type-h2">
        {d.title}
      </h2>
      <p className="type-body" data-testid="signed-by" dir="auto">
        {fill(d.by, { name: `⁨${proof.signedName ?? ""}⁩`, date: whenText })}
      </p>
      <p className="type-body">{d.locked}</p>
      {promisedText && (
        <p className="type-body" data-testid="signed-promised">
          {fill(d.promised, { date: promisedText })}
        </p>
      )}
      <p className="type-body font-semibold" data-testid="signed-next">
        {d.next}
      </p>
      <p className="type-small text-brand-ink-muted">{d.changeHint}</p>
    </section>
  )
}
