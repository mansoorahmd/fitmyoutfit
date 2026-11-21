"use client"

import { useEffect, useState } from "react"

import { designContent } from "@content/design"
import { designPath } from "@lib/editor/paths"
import { hasSavedDesign } from "@lib/editor/saved-design"
import { ButtonLink } from "@modules/common/components/button"

/**
 * The product page's way into the 3D designer, for a product that has a
 * model. It reads "Design your kit"; when this device holds a saved design
 * for the product it reads "Continue your design". The saved state lives in
 * the browser, so the first paint (and the server's) is "Design your kit".
 * Secondary, so the page's one red button stays "Add to cart".
 */
export default function DesignButton({ handle }: { handle: string }) {
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSaved(hasSavedDesign(handle))
  }, [handle])

  return (
    <ButtonLink
      href={designPath(handle)}
      variant="secondary"
      fullWidth
      data-testid="design-button"
    >
      {saved ? designContent.button.resume : designContent.button.start}
    </ButtonLink>
  )
}
