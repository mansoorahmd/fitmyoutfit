"use client"

import { clx } from "@medusajs/ui"
import React, { Fragment, useEffect, useRef, useState } from "react"

import { productContent } from "@content/product"
import {
  SizeChart,
  SizeChartUnit,
  displayMeasurement,
  isChosenSize,
  sizeChartTableRows,
} from "@lib/util/size-chart"
import { fill } from "@lib/util/wording"

/**
 * Sizes down, measurements across (docs/design/05-m1-pages.md, 3.2 and
 * 3.4, 6). Up to three measurement columns fit a 360 px phone; with more,
 * the table scrolls sideways inside its own box, with a sticky size column
 * and a fade on the right edge, and the box becomes focusable so the
 * keyboard can scroll it. The chosen size's row is marked in words
 * ("Your choice") as well as colour.
 */
const SizeChartTable = ({
  chart,
  unit,
  productTitle,
  chosenSize,
  chosenRowRef,
}: {
  chart: SizeChart
  unit: SizeChartUnit
  productTitle: string
  chosenSize?: string
  /** Gets the chosen size's row, so the sheet can bring it into view. */
  chosenRowRef?: React.Ref<HTMLTableRowElement>
}) => {
  const words = productContent.sizeChart
  const boxRef = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  const many = chart.columns.length > 3

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      setScrolls(box.scrollWidth > box.clientWidth + 1)
      setAtEnd(box.scrollLeft + box.clientWidth >= box.scrollWidth - 1)
    }
    measure()
    box.addEventListener("scroll", measure, { passive: true })
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null
    observer?.observe(box)
    return () => {
      box.removeEventListener("scroll", measure)
      observer?.disconnect()
    }
  }, [chart.columns.length])

  const rows = sizeChartTableRows(chart)
  const colSpan = chart.columns.length + 1

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className="overflow-x-auto rounded-control border border-brand-border"
        tabIndex={scrolls ? 0 : undefined}
        role={scrolls ? "region" : undefined}
        aria-label={scrolls ? words.scrollLabel : undefined}
        data-testid="size-chart-scroll"
      >
        <table className="w-full border-collapse text-left" data-testid="size-chart-table">
          <caption className="sr-only">
            {fill(words.caption, { product: productTitle, unit: words.unitNames[unit] })}
          </caption>
          <thead>
            <tr className="bg-brand-surface-alt">
              <th
                scope="col"
                className="sticky left-0 z-10 w-16 min-w-[64px] border-e border-brand-border bg-brand-surface-alt px-3 py-2 type-small font-semibold text-brand-ink"
              >
                {words.sizeColumn}
              </th>
              {chart.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={clx(
                    "px-3 py-2 text-right type-small font-semibold text-brand-ink",
                    many ? "min-w-[96px]" : "min-w-[88px]"
                  )}
                >
                  {fill(words.columnWithUnit, {
                    label: column.label,
                    unit: words.units[unit],
                  })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              if (entry.kind === "group") {
                return (
                  <tr key={`group-${entry.key}`} className="border-t border-brand-border">
                    <th
                      scope="colgroup"
                      colSpan={colSpan}
                      className="bg-brand-surface px-3 pb-1 pt-3 type-small font-semibold text-brand-ink-muted"
                    >
                      {entry.label}
                    </th>
                  </tr>
                )
              }
              const { row } = entry
              const chosen = isChosenSize(row.size, chosenSize)
              const cellBg = chosen ? "bg-brand-surface-alt" : "bg-brand-surface"
              return (
                <tr
                  key={row.size}
                  ref={chosen ? chosenRowRef : undefined}
                  className="h-11 border-t border-brand-border"
                  data-chosen={chosen ? "true" : undefined}
                  data-testid="size-chart-row"
                >
                  <th
                    scope="row"
                    className={clx(
                      "sticky left-0 z-10 whitespace-nowrap border-e border-brand-border px-3 type-body font-semibold text-brand-ink",
                      cellBg,
                      chosen && "shadow-[inset_4px_0_0_0_rgb(var(--c-ink))]"
                    )}
                  >
                    {row.size}
                    {chosen && (
                      <span className="block type-caption font-normal text-brand-ink-muted">
                        {words.yourChoice}
                      </span>
                    )}
                  </th>
                  {chart.columns.map((column) => {
                    const value = displayMeasurement(row.values[column.key], chart.unit, unit)
                    return (
                      <td
                        key={column.key}
                        className={clx("px-3 text-right type-body tabular-nums text-brand-ink", cellBg)}
                      >
                        {value ?? (
                          <Fragment>
                            <span aria-hidden="true">{words.missing}</span>
                            <span className="sr-only">{words.missingLabel}</span>
                          </Fragment>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {scrolls && !atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-px right-px w-8 rounded-e-control bg-gradient-to-l from-brand-surface to-transparent"
          data-testid="size-chart-fade"
        />
      )}
    </div>
  )
}

export default SizeChartTable
