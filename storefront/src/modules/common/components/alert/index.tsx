"use client"

import { clx } from "@medusajs/ui"
import React, { useEffect, useRef } from "react"

import LineIcon, { LineIconName } from "@modules/home/components/line-icon"

export type AlertVariant = "info" | "error" | "success"

const VARIANTS: Record<
  AlertVariant,
  { box: string; icon: LineIconName | null; iconColour: string }
> = {
  info: { box: "bg-brand-surface-alt border-brand-ink", icon: null, iconColour: "text-brand-ink" },
  error: { box: "bg-brand-error-surface border-brand-error", icon: "alert", iconColour: "text-brand-error" },
  success: { box: "bg-brand-success-surface border-brand-success", icon: "check", iconColour: "text-brand-success" },
}

type AlertProps = {
  variant?: AlertVariant
  title?: React.ReactNode
  children?: React.ReactNode
  /** Info alerts have no icon unless one fits (for example `team`). */
  icon?: LineIconName | null
  /** One action: a secondary button or a text link. */
  action?: React.ReactNode
  /**
   * Set when the alert appears after an action: errors are "alert", the
   * others "status", so screen readers announce them. Leave it off for an
   * alert that is part of the page when it loads.
   */
  announce?: boolean
  /** An error that blocks the main action takes focus when it appears. */
  focusOnMount?: boolean
  /** Can take focus from script (tabindex -1), for a button that points here. */
  focusable?: boolean
  id?: string
  className?: string
  "data-testid"?: string
  ref?: React.Ref<HTMLDivElement>
}

/**
 * A message for a whole section (docs/design/05-m1-pages.md, 2.5): 16 px
 * padding, a 4 px bar on the start edge, a 24 px icon, a title and text.
 * The variant is never shown by colour alone: the icon and the title say it.
 */
export const Alert = ({
  variant = "info",
  title,
  children,
  icon,
  action,
  announce = false,
  focusOnMount = false,
  focusable = false,
  id,
  className,
  "data-testid": dataTestId,
  ref,
}: AlertProps) => {
  const style = VARIANTS[variant]
  const iconName = icon === undefined ? style.icon : icon
  const ownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusOnMount) {
      ownRef.current?.focus()
    }
  }, [focusOnMount])

  const setRefs = (element: HTMLDivElement | null) => {
    ownRef.current = element
    if (typeof ref === "function") {
      ref(element)
    } else if (ref) {
      ;(ref as React.RefObject<HTMLDivElement | null>).current = element
    }
  }

  return (
    <div
      ref={setRefs}
      id={id}
      role={announce ? (variant === "error" ? "alert" : "status") : undefined}
      tabIndex={focusOnMount || focusable ? -1 : undefined}
      className={clx(
        "flex gap-3 rounded-card border-s-4 p-4 text-brand-ink",
        style.box,
        className
      )}
      data-variant={variant}
      data-testid={dataTestId ?? "alert"}
    >
      {iconName && (
        <LineIcon name={iconName} className={clx("h-6 w-6 shrink-0", style.iconColour)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="type-body font-semibold">{title}</p>}
        {children && <div className="type-small">{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  )
}

export default Alert
