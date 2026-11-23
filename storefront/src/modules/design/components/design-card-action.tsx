"use client"

import { useEffect, useState } from "react"

import { designContent } from "@content/design"
import { hasSavedGarmentDesign } from "@lib/editor/saved-design"

/**
 * The line under a chooser card's price: "Design this kit", or "Continue your design" when this
 * device holds a saved design for this garment (the jersey's V-neck and round neck are two). The saved state is in the browser, so the first
 * paint (and the server's) is "Design this kit".
 */
export default function DesignCardAction({ garmentId }: { garmentId: string }) {
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setSaved(hasSavedGarmentDesign(garmentId))
  }, [garmentId])
  return (
    <span className="mt-2 type-body font-semibold text-brand-ink underline underline-offset-4" data-testid="design-card-action">
      {saved ? designContent.chooser.cardResume : designContent.chooser.cardAction}
    </span>
  )
}
