import { Metadata } from "next"

import { STORE_NAME } from "@lib/store-config"
import NotFoundContent from "@modules/common/components/not-found"

export const metadata: Metadata = {
  title: `Page not found | ${STORE_NAME}`,
}

// Only reached outside a region (the middleware sends almost every path to
// one). Unknown paths inside a region use [countryCode]/(main)/not-found.tsx,
// which has the header and footer.
export default function NotFound() {
  return <NotFoundContent localized={false} />
}
