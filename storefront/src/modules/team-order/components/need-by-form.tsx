"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { teamOrderContent } from "@content/team-order"
import { setTeamOrderSchedule } from "@lib/data/team-orders"
import type { ScheduleState } from "@lib/team-order/types"
import { checkNeedByDate } from "@lib/team-order/validate"
import { dayWords, failureSentence } from "@lib/team-order/words"
import { fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import { TextField } from "@modules/common/components/text-field"

const words = teamOrderContent.order.needBy

/**
 * The need-by date: set, change, clear, and what the backend answers for it (`sentence`, worked out on the
 * server from the date and the store's day: the latest day to sign the proof; the states ok, needs rush and
 * cannot be met). While the order is a draft or its proof is out the date can change; after the signature it
 * is fixed. When standard delivery is too late the organizer can choose rush (the backend stores the choice;
 * the charge comes with payments, which are not open). A refusal is said in a sentence: a day that has passed
 * says today's date from the backend's own answer.
 */
export default function NeedByForm({
  orderId,
  needByDate,
  rushRequested,
  state,
  sentence,
  editable,
}: {
  orderId: string
  needByDate: string | null
  rushRequested: boolean
  state: ScheduleState
  /** The backend's schedule as a sentence (lib/team-order/words.ts), or null with no date. */
  sentence: string | null
  editable: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(needByDate ?? "")
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  const send = (change: { needByDate?: string | null; rushRequested?: boolean }) => {
    setError(undefined)
    startTransition(async () => {
      const result = await setTeamOrderSchedule(orderId, change)
      if (!result.ok) {
        setError(failureSentence(result.failure))
        return
      }
      if (change.needByDate !== undefined) setValue(result.value.needByDate ?? "")
      router.refresh()
    })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    const checked = checkNeedByDate(value)
    if (!checked.ok) {
      setError(teamOrderContent.refusals.need_by_date_invalid)
      return
    }
    send({ needByDate: checked.value })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="need-by" data-state={state}>
      <p className="type-body" data-testid="need-by-current">
        {needByDate ? fill(words.currentDate, { date: dayWords(needByDate) }) : words.none}
      </p>

      {sentence && (
        <Alert variant={state === "ok" ? "info" : state === "needs_rush" ? "info" : "error"} announce data-testid="need-by-schedule">
          {sentence}
        </Alert>
      )}

      {state === "needs_rush" && editable && (
        <div className="flex flex-col items-start gap-2" data-testid="need-by-rush">
          {rushRequested ? (
            <>
              <p className="type-body">{words.rushChosen}</p>
              <Button variant="secondary" onClick={() => send({ rushRequested: false })} isLoading={pending} data-testid="need-by-rush-off">
                {words.rushKeep}
              </Button>
            </>
          ) : (
            <>
              <p className="type-small text-brand-ink-muted">{words.rushNote}</p>
              <Button variant="secondary" onClick={() => send({ rushRequested: true })} isLoading={pending} data-testid="need-by-rush-on">
                {words.rushChoose}
              </Button>
            </>
          )}
        </div>
      )}

      {editable ? (
        <form className="flex max-w-md flex-col gap-3" onSubmit={submit} noValidate data-testid="need-by-form">
          <TextField
            id="need-by-date"
            type="date"
            label={words.label}
            hint={words.hint}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={error}
            data-testid="need-by-field"
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="secondary" isLoading={pending} loadingText={words.saving} data-testid="need-by-save">
              {needByDate ? words.change : words.set}
            </Button>
            {needByDate && (
              <Button variant="text" onClick={() => send({ needByDate: null })} disabled={pending} data-testid="need-by-clear">
                {words.clear}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="type-small text-brand-ink-muted">{words.locked}</p>
      )}
    </div>
  )
}
