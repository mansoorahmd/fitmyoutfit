"use client"

import { useEffect, useRef, useState } from "react"

import { teamOrderContent } from "@content/team-order"
import { checkNeedByDate, checkTeamName } from "@lib/team-order/validate"
import { Button, ButtonLink } from "@modules/common/components/button"
import { TextField } from "@modules/common/components/text-field"

const words = teamOrderContent.designer

export type StartStatus =
  | { kind: "idle" }
  | { kind: "working" }
  /** A call failed: what happened in a sentence, and whether the order exists (so it can be opened). */
  | { kind: "failed"; text: string; orderPath: string | null; signedOut: boolean }

export type TeamOrderDialogProps = {
  /** Which step is open: none, the signed-out step, or the one short step that asks for the team name. */
  step: "none" | "sign-in" | "start"
  /** The design's team name, offered as the order's. */
  defaultTeamName: string
  /** A path without the country code: the sign-in page that returns to the designer. */
  signInHref: string
  status: StartStatus
  onSubmit: (input: { teamName: string; needByDate: string | null }) => void
  onCancel: () => void
}

/**
 * The step before a team order is made, on top of the designer (a native modal dialog, so it sits
 * above the Done panel, which is one too):
 * - signed out: "sign in to start your team order", with the way to sign in or create an account (the
 *   address returns here; the design and the list stay on this device);
 * - signed in: the team name (offered from the design's) and an optional need-by date, then the
 *   calls run and the organizer lands on the team order's page.
 * A failure is said in a sentence here, with "Try again": nothing typed is lost.
 */
export default function TeamOrderDialog({ step, defaultTeamName, signInHref, status, onSubmit, onCancel }: TeamOrderDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [teamName, setTeamName] = useState(defaultTeamName)
  const [needBy, setNeedBy] = useState("")
  const [errors, setErrors] = useState<{ teamName?: string; needBy?: string }>({})
  const open = step !== "none"

  // the design's name changes while the dialog is closed: offer the latest when it opens
  useEffect(() => {
    if (open) setTeamName((current) => (current === "" ? defaultTeamName : current))
  }, [open, defaultTeamName])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal()
      else dialog.setAttribute("open", "")
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const working = status.kind === "working"

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (working) return
    const name = checkTeamName(teamName)
    const date = checkNeedByDate(needBy)
    const next: { teamName?: string; needBy?: string } = {}
    if (!name.ok) next.teamName = teamOrderContent.refusals.team_name_invalid
    if (!date.ok) next.needBy = teamOrderContent.refusals.need_by_date_invalid
    setErrors(next)
    if (!name.ok || !date.ok) return
    onSubmit({ teamName: name.value, needByDate: date.value })
  }

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        if (!working) onCancel()
      }}
      aria-labelledby="team-order-dialog-title"
      className="m-auto w-[min(92vw,28rem)] rounded-card border border-brand-border bg-white p-0 text-brand-ink backdrop:bg-black/50"
      data-testid="team-order-dialog"
    >
      {step === "sign-in" && (
        <div className="flex flex-col gap-4 p-6" data-testid="team-order-sign-in">
          <h2 id="team-order-dialog-title" className="type-h2">
            {words.signIn.title}
          </h2>
          <p className="type-body text-brand-ink-muted">{words.signIn.text}</p>
          <div className="flex flex-col gap-3">
            <ButtonLink href={signInHref} fullWidth data-testid="team-order-sign-in-link">
              {words.signIn.action}
            </ButtonLink>
            <Button variant="text" onClick={onCancel} data-testid="team-order-cancel">
              {words.signIn.cancel}
            </Button>
          </div>
        </div>
      )}
      {step === "start" && (
        <form className="flex flex-col gap-4 p-6" onSubmit={submit} noValidate data-testid="team-order-start">
          <h2 id="team-order-dialog-title" className="type-h2">
            {words.start.title}
          </h2>
          <p className="type-body text-brand-ink-muted">{words.start.text}</p>
          <TextField
            id="team-order-name"
            label={words.start.teamName}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            error={errors.teamName}
            dir="auto"
            autoComplete="off"
            required
            disabled={working}
            data-testid="team-order-name"
          />
          <TextField
            id="team-order-need-by"
            type="date"
            label={words.start.needBy}
            hint={words.start.needByHint}
            value={needBy}
            onChange={(e) => setNeedBy(e.target.value)}
            error={errors.needBy}
            disabled={working}
            data-testid="team-order-need-by"
          />
          {status.kind === "failed" && (
            <div role="alert" className="rounded-card border-s-4 border-brand-error bg-brand-error-surface p-4 type-body" data-testid="team-order-failed">
              <p>{status.text}</p>
              {status.orderPath && (
                <p className="mt-2">
                  <ButtonLink href={status.orderPath} variant="text" data-testid="team-order-open-order">
                    {words.startFailed.openOrder}
                  </ButtonLink>
                </p>
              )}
              {status.signedOut && (
                <p className="mt-2">
                  <ButtonLink href={signInHref} variant="text">
                    {words.signIn.action}
                  </ButtonLink>
                </p>
              )}
            </div>
          )}
          {working && (
            <p role="status" className="type-body text-brand-ink-muted" data-testid="team-order-working">
              {words.start.working}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Button type="submit" fullWidth isLoading={working} loadingText={words.start.working} data-testid="team-order-submit">
              {status.kind === "failed" ? words.startFailed.retry : words.start.submit}
            </Button>
            <Button variant="text" onClick={onCancel} disabled={working} data-testid="team-order-cancel">
              {words.start.cancel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
