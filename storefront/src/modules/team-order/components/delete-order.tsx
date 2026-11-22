"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { teamOrderContent } from "@content/team-order"
import { deleteTeamOrder } from "@lib/data/team-orders"
import { failureSentence } from "@lib/team-order/words"
import { Button } from "@modules/common/components/button"

const words = teamOrderContent.order

/** "Delete this team order" for a draft, with a confirmation (it deletes the list too and cannot be undone). */
export default function DeleteOrder({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

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
    if (pending) return
    setError(undefined)
    startTransition(async () => {
      const result = await deleteTeamOrder(orderId)
      if (!result.ok) {
        // an order that is already gone is as good as deleted
        if (result.failure.kind === "not_found") {
          router.push(`/${countryCode}/account/team-orders`)
          return
        }
        setError(failureSentence(result.failure))
        return
      }
      router.push(`/${countryCode}/account/team-orders`)
    })
  }

  return (
    <>
      <Button variant="text" onClick={() => setOpen(true)} data-testid="team-order-delete">
        {words.actions.delete}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-team-order-title"
        onCancel={(event) => {
          event.preventDefault()
          if (!pending) setOpen(false)
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-card border border-brand-border bg-white p-0 text-brand-ink backdrop:bg-black/50"
        data-testid="team-order-delete-dialog"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id="delete-team-order-title" className="type-h2">
            {words.delete.title}
          </h2>
          <p className="type-body text-brand-ink-muted">{words.delete.text}</p>
          {error && (
            <p role="alert" className="type-body text-brand-error" data-testid="team-order-delete-error">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Button onClick={confirm} isLoading={pending} loadingText={words.delete.deleting} fullWidth data-testid="team-order-delete-confirm">
              {words.delete.confirm}
            </Button>
            <Button variant="text" onClick={() => setOpen(false)} disabled={pending} data-testid="team-order-delete-cancel">
              {words.delete.cancel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
