"use client"

import { useEffect, useRef } from "react"

import Alert from "@modules/common/components/alert"

/** How long a message stays. */
export const STATUS_TOAST_MS = 6000

/**
 * A short message after an action (docs/design/05-m1-pages.md, 9.5 and
 * 9.6: "Saved", "We couldn't remove the address."), 16 px from the foot of
 * the screen, announced to screen readers (`status`, or `alert` for an
 * error), gone after a few seconds. It never takes focus.
 */
const StatusToast = ({
  message,
  variant,
  messageKey,
  onClose,
}: {
  message: string
  variant: "success" | "error"
  /** Changes with each message, so a new one restarts the timer. */
  messageKey: string | number
  onClose: () => void
}) => {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), STATUS_TOAST_MS)
    return () => clearTimeout(timer)
  }, [messageKey])

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex justify-center lg:inset-x-auto lg:end-8 lg:bottom-8">
      <Alert
        variant={variant}
        title={message}
        announce
        className="pointer-events-auto w-full max-w-[440px] shadow-lg"
        data-testid="status-toast"
      />
    </div>
  )
}

export default StatusToast
