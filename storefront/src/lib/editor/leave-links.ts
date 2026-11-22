// The links out of the designer (its store menu and its wordmark), as data: which are shown for
// this visitor and where each leads. Plain functions, tested on their own.

import { designContent } from "@content/design"
import { teamOrderContent } from "@content/team-order"
import { authHref } from "@lib/util/account-auth"

import { CHOOSER_PATH } from "./chooser"
import { designOrderPath, teamOrderPath, TEAM_ORDERS_PATH } from "./designer-context"
import { designPath } from "./paths"

export type LeaveLink = {
  id: "home" | "product" | "chooser" | "order" | "team-orders" | "account" | "sign-in"
  label: string
  href: string
  /** "garments": the press opens the editor's own garment chooser instead of leaving (the address stays as the fallback link). */
  action?: "garments"
  /** One sentence under the label. */
  hint?: string
}

/**
 * The menu's links with the country code in them. Always: the store's home, the product, the garment
 * chooser and the account. Signed in: "Team orders", and "This team order" when the designer is open
 * for one. Signed out: "Sign in" in place of the two. Where a visitor leaves to, the work is saved first
 * (the designer does that; this says only where).
 */
export function leaveLinks(input: {
  countryCode: string
  handle: string
  signedIn: boolean
  orderId: string | null
  /** Where "Sign in" brings the visitor back to. */
  returnTo: string
  /**
   * "editor": the editor offers its garment chooser here (the menu's "Change garment" opens it); "page" (the default):
   * it leads to the chooser page. Inside a team order, where the editor does not offer a garment change (one garment, or
   * a locked list), the link keeps leading to the page and says how to design another garment.
   */
  garments?: "editor" | "page"
}): LeaveLink[] {
  const w = designContent.leave
  const cc = `/${input.countryCode}`
  const links: LeaveLink[] = [
    { id: "home", label: w.home, href: cc },
    { id: "product", label: w.product, href: `${cc}/products/${input.handle}` },
    {
      id: "chooser",
      label: w.changeGarment,
      href: `${cc}${CHOOSER_PATH}`,
      ...(input.garments === "editor" ? { action: "garments" as const } : input.orderId ? { hint: w.garmentInOrder } : {}),
    },
  ]
  if (input.signedIn) {
    if (input.orderId) links.push({ id: "order", label: w.thisOrder, href: `${cc}${teamOrderPath(input.orderId)}` })
    links.push({ id: "team-orders", label: teamOrderContent.nav.label, href: `${cc}${TEAM_ORDERS_PATH}` })
    links.push({ id: "account", label: w.account, href: `${cc}/account` })
  } else {
    links.push({ id: "sign-in", label: w.signIn, href: `${cc}${authHref("signin", { next: input.returnTo })}` })
  }
  return links
}

/** The designer's own address (to come back to after signing in), without the country code. */
export const designerReturnPath = (handle: string, orderId: string | null): string => (orderId ? designOrderPath(handle, orderId) : designPath(handle))
