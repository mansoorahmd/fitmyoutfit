"use client"

import { clx } from "@medusajs/ui"
import React, { useEffect, useRef, useState } from "react"

import LineIcon from "@modules/home/components/line-icon"

/** How long the toast stays (05, 4.3). Paused while it has focus or the pointer. */
export const TOAST_MS = 8000

/**
 * The toast after a removal (docs/design/05-m1-pages.md, 4.3): "Removed:
 * Jersey, M × 4" with "Undo", on navy, for 8 seconds. Undoing late loses
 * nothing: the item can be added again from its page. It waits while it
 * has focus or the pointer is over it, and it says so when Undo fails.
 * Above the phone's sticky bar; bottom right from 1024 px.
 */
const UndoToast = ({
  message,
  messageKey,
  actionLabel,
  closeLabel,
  errorText,
  onAction,
  onClose,
}: {
  /** The words, with the product's name inside <bdi>. */
  message: React.ReactNode
  /** Changes with each removal, so a new one restarts the timer. */
  messageKey: string
  actionLabel: string
  closeLabel: string
  errorText: string
  /** Resolves true when the undo worked. */
  onAction: () => Promise<boolean>
  onClose: () => void
}) => {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (paused || busy) {
      return
    }
    const timer = setTimeout(() => onCloseRef.current(), TOAST_MS)
    return () => clearTimeout(timer)
  }, [paused, busy, messageKey])

  const undo = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onAction().catch(() => false)
    setBusy(false)
    if (ok) {
      onCloseRef.current()
    } else {
      setFailed(true)
    }
  }

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false)
        }
      }}
      className={clx(
        "fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-card bg-brand-inverse py-1 pl-4 pr-1 text-brand-on-inverse shadow-xl",
        "lg:inset-x-auto lg:bottom-6 lg:right-8 lg:w-[400px]"
      )}
      data-testid="undo-toast"
    >
      <div className="flex min-w-0 flex-1 flex-col py-2">
        <p className="type-small font-semibold">{message}</p>
        {failed && (
          <p className="flex items-center gap-1 type-small" data-testid="undo-error">
            <LineIcon name="alert" className="h-4 w-4 shrink-0" />
            {errorText}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={undo}
        aria-disabled={busy || undefined}
        className="min-h-[44px] shrink-0 px-3 type-small font-semibold underline underline-offset-4 aria-disabled:opacity-60"
        data-testid="undo-button"
      >
        {actionLabel}
      </button>
      <button
        type="button"
        onClick={() => onCloseRef.current()}
        aria-label={closeLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-brand-on-inverse/10"
      >
        <LineIcon name="x" className="h-5 w-5" />
      </button>
    </div>
  )
}

export default UndoToast
