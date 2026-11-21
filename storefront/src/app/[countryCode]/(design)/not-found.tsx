import { Metadata } from "next"

import { STORE_NAME } from "@lib/store-config"
import NotFoundContent from "@modules/common/components/not-found"

export const metadata: Metadata = {
  title: `Page not found | ${STORE_NAME}`,
}

// A product with no 3D model, or no product at all, under /design/. Same page
// as everywhere in the store; the designer's frame has no header or footer,
// so the page carries its two links.
export default function NotFound() {
  return <NotFoundContent />
}
