"use client"

import { useEffect } from "react"

import { checkoutContent } from "@content/checkout"
import { useOnline } from "@lib/hooks/use-online"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"

const words = checkoutContent.pageError

/** Loads the page again from the server: what is true now, the order if there is one. */
const reload = () => window.location.reload()

/** When this page last loaded itself again on appearing, per path (browser memory for the tab). */
const SELF_RELOAD_KEY = "fmo-page-error-self-reload"
/** A page that fails again this soon after loading itself again is not loaded again by itself. */
export const SELF_RELOAD_GAP_MS = 60_000

/**
 * Loads the page again once if the browser is online when the error page
 * appears (QA S1-4c, m9): the connection came back before this page could
 * listen for it, so the "online" event had already gone by. At most once
 * per path a minute, so a page that fails for another reason doesn't load
 * itself over and over; the button stays.
 */
export const reloadIfBackOnline = (now = Date.now()): boolean => {
  if (typeof navigator === "undefined" || !navigator.onLine) return false
  try {
    const path = window.location.pathname
    const kept = JSON.parse(sessionStorage.getItem(SELF_RELOAD_KEY) ?? "{}") as Record<string, number>
    if (typeof kept[path] === "number" && now - kept[path] < SELF_RELOAD_GAP_MS) return false
    sessionStorage.setItem(SELF_RELOAD_KEY, JSON.stringify({ ...kept, [path]: now }))
  } catch {
    // no browser memory (private mode): the page can't tell a loop, so it waits for a press
    return false
  }
  reload()
  return true
}

/**
 * The error boundary's page for the checkout and the order pages (QA S1-4,
 * D12). The usual cause is the connection going while the order is being
 * placed: the order may exist, and the next page's code couldn't load.
 * It says that, without claiming either way, and loads the page again by
 * itself when the browser is back online. Loading the checkout again with
 * an ordered cart leads to the confirmation (CompletedCartRecovery).
 *
 * `orderPage`: the error happened on the checkout or an order's page, so
 * the order may have been placed. Elsewhere only the plain message shows.
 */
const PageError = ({ orderPage }: { orderPage: boolean }) => {
  const online = useOnline()

  useEffect(() => {
    window.addEventListener("online", reload)
    reloadIfBackOnline()
    return () => window.removeEventListener("online", reload)
  }, [])

  return (
    <div className="content-container py-12" data-testid="page-error" data-online={online}>
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <Alert
          variant="error"
          title={online ? words.title : words.offlineTitle}
          announce
          focusOnMount
          action={
            <Button onClick={reload} data-testid="page-error-reload">
              {words.reload}
            </Button>
          }
          data-testid="page-error-alert"
        >
          {orderPage && <p>{words.orderMayExist}</p>}
          <p>{online ? words.tryAgain : words.whenOnline}</p>
        </Alert>
      </div>
    </div>
  )
}

export default PageError
