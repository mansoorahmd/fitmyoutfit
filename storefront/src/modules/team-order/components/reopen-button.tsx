"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { proofContent } from "@content/proof"
import { reopenTeamOrder } from "@lib/data/team-orders"
import { stepFailure } from "@lib/team-order/signing"
import { Button } from "@modules/common/components/button"

const w = proofContent.reopen

/**
 * "Change the list": goes back to a draft from a proof that is out or signed. It asks first, because it
 * withdraws the proof (a signed one is replaced and a new one must be signed), then asks the backend and goes
 * on to `afterHref` (the designer, where the list is editable again, or the team-order page). A refusal is a
 * sentence under the button; nothing is changed when the backend refuses.
 */
export default function ReopenButton({
  orderId,
  signed,
  afterHref,
  variant = "secondary",
}: {
  orderId: string
  /** The proof is signed (the confirmation says a new one must be signed). */
  signed: boolean
  /** Where to go once the order is a draft again (a path with the country code). */
  afterHref: string
  variant?: "secondary" | "text"
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal()
      else el.setAttribute("open", "")
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  const confirm = () => {
    if (busy.current) return
    busy.current = true
    setError(undefined)
    startTransition(async () => {
      let result
      try {
        result = await reopenTeamOrder(orderId)
      } catch {
        result = { ok: false as const, failure: { kind: "unavailable" as const } }
      }
      if (!result.ok) {
        const failure = stepFailure("reopen", result.failure)
        // already a draft: the same as done
        if (result.failure.kind === "refused" && result.failure.code === "team_order_already_draft") {
          router.push(afterHref)
          return
        }
        setError(failure.text)
        busy.current = false
        return
      }
      router.push(afterHref)
    })
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} data-testid="reopen-open">
        {w.button}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="reopen-title"
        onCancel={(event) => {
          event.preventDefault()
          if (!pending) setOpen(false)
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-card border border-brand-border bg-white p-0 text-brand-ink backdrop:bg-black/50"
        data-testid="reopen-dialog"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id="reopen-title" className="type-h2">
            {w.title}
          </h2>
          <p className="type-body text-brand-ink-muted">{signed ? w.textSigned : w.textSent}</p>
          {error && (
            <p role="alert" className="type-body text-brand-error" data-testid="reopen-error">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Button onClick={confirm} isLoading={pending} loadingText={w.working} fullWidth data-testid="reopen-confirm">
              {w.confirm}
            </Button>
            <Button variant="text" onClick={() => setOpen(false)} disabled={pending} data-testid="reopen-cancel">
              {w.cancel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
