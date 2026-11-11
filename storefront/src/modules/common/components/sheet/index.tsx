"use client"

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react"
import { clx } from "@medusajs/ui"
import React, { useEffect, useId, useRef } from "react"

import LineIcon from "@modules/home/components/line-icon"

/** Whether the current history entry is the one this sheet added. */
const ownsEntry = (entryId: string): boolean =>
  typeof window !== "undefined" && window.history.state?.sheet === entryId

type SheetProps = {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  /** A line under the title, in `small` `ink-muted` (the product's name). */
  subtitle?: React.ReactNode
  /** The close button's accessible name ("Close size chart"). */
  closeLabel: string
  children: React.ReactNode
  /** Adds a history entry while open, so the phone's Back closes it. */
  closeOnBack?: boolean
  "data-testid"?: string
}

/**
 * A bottom sheet below 768 px and a centred 640 px dialog from 768 px
 * (docs/design/05-m1-pages.md, 3.4), on Headless UI's Dialog like the
 * region selector: focus moves to the title and stays inside; Esc, the
 * backdrop and the close button close it, and focus then returns to the
 * control that opened it. With `closeOnBack`, opening adds a history entry,
 * so Back closes the sheet instead of leaving the page.
 */
const Sheet = ({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
  closeOnBack = true,
  "data-testid": dataTestId,
}: SheetProps) => {
  const entryId = useId()
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || !closeOnBack) {
      return
    }
    // One entry per opening, even when React runs this twice in development.
    // The router's own state is kept in it, so going back is harmless.
    if (!ownsEntry(entryId)) {
      window.history.pushState({ ...window.history.state, sheet: entryId }, "")
    }
    const onPop = () => {
      if (!ownsEntry(entryId)) {
        onCloseRef.current()
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [open, closeOnBack, entryId])

  // Focus goes to the title on every device (05, 3.4). Headless UI 2 skips
  // `initialFocus` on touch screens (`pointer: coarse`), to keep the
  // keyboard down, and focuses the dialog itself; the title opens no
  // keyboard, so it takes focus there too, once the panel is on screen.
  useEffect(() => {
    if (!open) {
      return
    }
    let frame = 0
    let tries = 0
    const focusTitle = () => {
      const title = titleRef.current
      if (title) {
        if (!title.contains(document.activeElement)) {
          title.focus({ preventScroll: true })
        }
        return
      }
      if (++tries < 10) {
        frame = window.requestAnimationFrame(focusTitle)
      }
    }
    frame = window.requestAnimationFrame(focusTitle)
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  // Closing by the button, Esc or the backdrop takes our entry off too; the
  // popstate that follows does the closing.
  const close = () => {
    if (closeOnBack && ownsEntry(entryId)) {
      window.history.back()
      return
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      initialFocus={titleRef}
      className="relative z-[100]"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-brand-ink/50 transition-opacity duration-200 ease-out data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 flex items-end md:items-center md:justify-center md:p-6">
        <DialogPanel
          transition
          className={clx(
            "flex max-h-[90vh] w-full flex-col rounded-t-sheet bg-brand-surface text-brand-ink shadow-xl",
            "transition duration-200 ease-out data-[closed]:translate-y-full",
            "md:max-h-[85vh] md:w-[640px] md:rounded-card md:data-[closed]:translate-y-0 md:data-[closed]:opacity-0"
          )}
          data-testid={dataTestId ?? "sheet"}
        >
          {/* the drag handle is decorative: the sheet closes by the button, Esc or Back */}
          <div aria-hidden="true" className="flex justify-center pt-2 md:hidden">
            <span className="h-1 w-8 rounded-full bg-brand-border" />
          </div>
          <div className="flex items-start justify-between gap-4 px-4 pt-2 md:px-6 md:pt-4">
            <div className="flex min-w-0 flex-col pt-2">
              <DialogTitle
                as="h3"
                ref={titleRef}
                tabIndex={-1}
                className="type-h3 text-brand-ink"
              >
                {title}
              </DialogTitle>
              {subtitle && (
                <p className="type-small text-brand-ink-muted">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={closeLabel}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-brand-surface-alt"
              data-testid="sheet-close"
            >
              <LineIcon name="x" className="h-6 w-6" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-6">
            {children}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export default Sheet
