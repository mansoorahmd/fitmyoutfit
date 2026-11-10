import { notFound } from "next/navigation"

// Any path inside a region that no other route matches (for example
// /pk/no-such-page, or /fr/store after the middleware sent it to /pk/fr/store)
// lands here, so it gets the styled not-found page inside the (main) layout,
// with the header and footer, instead of the bare root not-found page.
export default function CatchAllNotFound() {
  notFound()
}
