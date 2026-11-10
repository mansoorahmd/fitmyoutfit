"use client"

import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import React, { useId } from "react"

import { groupOptionValues } from "@lib/util/sizes"
import LineIcon from "@modules/home/components/line-icon"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (optionId: string, value: string) => void
  title: string
  disabled: boolean
  /** Values to show as unavailable (dashed, struck through, still selectable). */
  unavailable?: string[]
  /** A message under the label ("Choose a size"), with an icon, in the error colour. */
  error?: string
  /** The radio group, so the main button can move focus to it. */
  groupRef?: React.Ref<HTMLDivElement>
  "data-testid"?: string
}

/**
 * One product option as a radio group of chips (docs/design/03-direction.md,
 * "Size selector"). Sizes come in two labelled groups, Youth and Adult; which
 * size is which is decided in lib/util/sizes.ts. Chips are native radio
 * inputs, so arrow keys move between them and assistive technology hears a
 * radio group with the checked value.
 */
const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
  unavailable = [],
  error,
  groupRef,
}) => {
  const id = useId()
  const errorId = `${id}-error`
  const groups = groupOptionValues(
    title,
    (option.values ?? []).map((v) => v.value)
  )

  return (
    <div className="flex flex-col gap-y-3">
      {/* "Size" before a choice, "Size: M" after */}
      <p
        className="type-body font-semibold text-brand-ink"
        aria-hidden="true"
        data-testid="option-label"
      >
        {title}
        {current ? `: ${current}` : ""}
      </p>
      {error && (
        <p
          id={errorId}
          className="-mt-1 flex items-center gap-2 type-small font-semibold text-brand-error"
          data-testid="option-error"
        >
          <LineIcon name="alert" className="h-5 w-5 shrink-0" />
          {error}
        </p>
      )}
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={title}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        // Focusable by script only: the main button moves focus here when
        // it is pressed with no size chosen.
        tabIndex={-1}
        className="flex flex-col gap-y-4 rounded-control"
        data-testid={dataTestId}
      >
        {groups.map((group) => {
          const groupLabelId = `${id}-${group.key}`

          return (
            <div key={group.key} className="flex flex-col gap-y-2">
              {group.label && (
                <p
                  id={groupLabelId}
                  className="type-small font-semibold text-brand-ink-muted"
                >
                  {group.label}
                </p>
              )}
              {/*
                4 to a row on phones, a flexible row from 768 px, and from
                1024 px a 7-column grid in the buy column: the seven adult
                sizes stay on one row (no lone "3XL") and both groups line up.
              */}
              <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap lg:grid lg:grid-cols-7">
                {group.values.map((value) => {
                  const isUnavailable = unavailable.includes(value)

                  return (
                    <label key={value} className="relative flex">
                      <input
                        type="radio"
                        name={`${id}-option`}
                        value={value}
                        checked={value === current}
                        onChange={() => updateOption(option.id, value)}
                        disabled={disabled}
                        aria-describedby={group.label ? groupLabelId : undefined}
                        className="peer sr-only"
                        data-testid="option-button"
                      />
                      <span
                        className={clx(
                          "relative flex h-12 w-full items-center justify-center overflow-hidden px-3 md:min-w-[64px] md:px-4 lg:min-w-[44px] lg:px-1",
                          "rounded-control border bg-brand-surface type-body font-semibold text-brand-ink",
                          "cursor-pointer transition-colors duration-150 ease-out",
                          "hover:border-brand-ink",
                          "peer-checked:border-brand-ink peer-checked:bg-brand-ink peer-checked:text-brand-on-inverse",
                          // The ring shows on the chip while its radio has
                          // keyboard focus. The outline style is written as
                          // [outline-style:solid], not `outline`: clx's
                          // tailwind-merge 3 reads `outline` as a width (the
                          // Tailwind 4 meaning) and drops it beside
                          // `outline-2`, which left the chip with no ring.
                          "peer-focus-visible:[outline-style:solid] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-focus",
                          "peer-disabled:cursor-not-allowed",
                          isUnavailable
                            ? "border-dashed border-brand-border-strong text-brand-ink-muted"
                            : "border-brand-border-strong"
                        )}
                      >
                        {isUnavailable && (
                          <svg
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 h-full w-full"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            <line
                              x1="0"
                              y1="100"
                              x2="100"
                              y2="0"
                              stroke="currentColor"
                              strokeWidth="1"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        )}
                        {value}
                        {isUnavailable && (
                          <span className="sr-only">, unavailable</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect
