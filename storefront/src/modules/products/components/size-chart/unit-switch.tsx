"use client"

import { clx } from "@medusajs/ui"
import { useId } from "react"

import { productContent } from "@content/product"
import { SizeChartUnit } from "@lib/util/size-chart"

const UNITS: SizeChartUnit[] = ["cm", "in"]

/**
 * "cm | in" (docs/design/05-m1-pages.md, 3.4, 3): a two-option radio group,
 * each option 56 × 44. The chosen one is filled `ink` with white text and
 * checked, so it is told apart by more than colour.
 */
const UnitSwitch = ({
  value,
  onChange,
}: {
  value: SizeChartUnit
  onChange: (unit: SizeChartUnit) => void
}) => {
  const name = useId()
  const { unitLabel, units } = productContent.sizeChart

  return (
    <div
      role="radiogroup"
      aria-label={unitLabel}
      className="inline-flex self-start rounded-control border border-brand-border-strong"
      data-testid="unit-switch"
    >
      {UNITS.map((unit) => (
        <label key={unit} className="relative flex">
          <input
            type="radio"
            name={name}
            value={unit}
            checked={value === unit}
            onChange={() => onChange(unit)}
            className="peer sr-only"
          />
          <span
            className={clx(
              "flex h-11 w-14 cursor-pointer items-center justify-center type-body font-semibold text-brand-ink transition-colors duration-150 ease-out",
              "first:rounded-s-control last:rounded-e-control hover:bg-brand-surface-alt",
              "peer-checked:bg-brand-ink peer-checked:text-brand-on-inverse",
              "peer-focus-visible:[outline-style:solid] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-focus"
            )}
          >
            {units[unit]}
          </span>
        </label>
      ))}
    </div>
  )
}

export default UnitSwitch
