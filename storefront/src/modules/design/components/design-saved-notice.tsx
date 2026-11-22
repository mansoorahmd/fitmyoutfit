"use client"

import { useState } from "react"

import { designContent } from "@content/design"

/**
 * Shown on the product page after "Done" in the designer (the address has
 * ?design=saved): the design is saved on this device, and a designed kit
 * cannot be ordered yet. Honest about both; it promises no date.
 */
export default function DesignSavedNotice() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  const { saved } = designContent

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-brand-border bg-brand-surface-alt p-4"
      data-testid="design-saved-notice"
    >
      <div className="flex-1">
        <p className="type-body font-semibold text-brand-ink">{saved.title}</p>
        <p className="type-small text-brand-ink-muted">{saved.text}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={saved.dismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-brand-ink"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
