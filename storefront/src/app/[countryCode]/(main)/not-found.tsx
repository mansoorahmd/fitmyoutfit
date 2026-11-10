import { Metadata } from "next"

import { STORE_NAME } from "@lib/store-config"
import NotFoundContent from "@modules/common/components/not-found"

export const metadata: Metadata = {
  title: `Page not found | ${STORE_NAME}`,
}

// Rendered inside the (main) layout, so the page keeps the header and footer.
export default function NotFound() {
  return <NotFoundContent />
}
