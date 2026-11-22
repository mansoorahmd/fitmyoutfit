"use client"

import { BarsThree } from "@medusajs/icons"
import { useEffect, useId, useRef, useState } from "react"

import { designContent } from "@content/design"
import type { LeaveLink } from "@lib/editor/leave-links"

/**
 * The designer's way out into the store, in the editor's top bar (its `account` slot, which shows on
 * every width): a button that opens a short list of links. A press on a link does not change the page
 * by itself: `onLeave` saves the design and the team list first (the designer's own save points), then
 * changes the page. A link still works as a link (open in a new tab, copy the address).
 */
export default function DesignerMenu({ links, onLeave }: { links: LeaveLink[]; onLeave: (href: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const words = designContent.leave

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  // The wrapper sits a little closer to its neighbours (the button stays 44 px), so a phone's top bar
  // still has room to say "Not saved" in full.
  return (
    <div ref={root} className="relative -ms-2 -me-0.5" data-testid="designer-menu">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={words.menuLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex h-11 w-11 items-center justify-center rounded-control text-brand-on-inverse hover:bg-brand-on-inverse/10"
        data-testid="designer-menu-button"
      >
        <BarsThree width={24} height={24} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={words.menuTitle}
          className="fixed right-2 top-14 z-40 flex w-[min(320px,calc(100vw-16px))] flex-col gap-1 rounded-card border border-brand-border bg-white p-2 text-brand-ink shadow-xl"
          data-testid="designer-menu-panel"
        >
          <p className="px-3 pb-1 pt-2 type-small text-brand-ink-muted">{words.note}</p>
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.href}
                  onClick={(e) => {
                    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                    e.preventDefault()
                    setOpen(false)
                    onLeave(link.href)
                  }}
                  className="flex min-h-12 items-center rounded-control px-3 type-body font-semibold hover:bg-brand-surface-alt"
                  data-testid={`designer-menu-${link.id}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
