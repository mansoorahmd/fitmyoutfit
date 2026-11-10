"use client"

import { CheckMini } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { usePathname } from "next/navigation"
import { useState, useTransition } from "react"

import { updateRegion } from "@lib/data/cart"
import { RegionChoice, pathWithoutCountry } from "@lib/util/region-choices"
import Spinner from "@modules/common/icons/spinner"

type RegionListProps = {
  choices: RegionChoice[]
  currentCountryCode: string
  /** Called when the visitor picks the region they are already in. */
  onKeep?: () => void
  "aria-labelledby"?: string
}

/**
 * The regions as rows: country, currency code, and a tick with the word
 * "Current" on the current one (never colour alone). Choosing another region
 * moves the cart to it and reloads the same page in that region, using the
 * starter's updateRegion server action.
 */
const RegionList = ({
  choices,
  currentCountryCode,
  onKeep,
  "aria-labelledby": labelledBy,
}: RegionListProps) => {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  const choose = (choice: RegionChoice) => {
    if (choice.countryCode === currentCountryCode) {
      onKeep?.()
      return
    }
    if (isPending) {
      return
    }
    setSwitchingTo(choice.countryCode)
    startTransition(async () => {
      await updateRegion(
        choice.countryCode,
        pathWithoutCountry(pathname, currentCountryCode)
      )
    })
  }

  return (
    <ul
      className="flex flex-col gap-1"
      aria-labelledby={labelledBy}
      aria-busy={isPending || undefined}
      data-testid="region-list"
    >
      {choices.map((choice) => {
        const isCurrent = choice.countryCode === currentCountryCode
        const isSwitching = isPending && switchingTo === choice.countryCode

        return (
          <li key={choice.countryCode}>
            <button
              type="button"
              onClick={() => choose(choice)}
              aria-current={isCurrent ? "true" : undefined}
              className={clx(
                "flex min-h-[48px] w-full items-center gap-3 rounded-control px-3 text-left",
                "transition-colors duration-150 ease-out hover:bg-brand-surface-alt",
                isCurrent && "bg-brand-surface-alt"
              )}
              data-testid="region-option"
            >
              <span className="flex-1 type-body text-brand-ink">
                {choice.countryName}
              </span>
              <span className="type-small font-semibold text-brand-ink-muted">
                {choice.currencyCode}
              </span>
              <span className="flex w-[76px] items-center justify-end gap-1 type-small font-semibold text-brand-ink">
                {isCurrent && (
                  <>
                    <CheckMini aria-hidden="true" />
                    Current
                  </>
                )}
                {isSwitching && (
                  <>
                    <Spinner size={16} aria-hidden="true" />
                    <span className="sr-only">Switching</span>
                  </>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default RegionList
