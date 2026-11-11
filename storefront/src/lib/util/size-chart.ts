// The product's size chart (docs/contracts/m1-checkout.md, section 2;
// docs/design/05-m1-pages.md, section 3), read from `metadata.size_chart`
// into a plain shape the table can lay out. A chart that is missing, empty
// or malformed is null, and the page then shows no link and no table.

import { OptionValueGroup, groupOptionValues } from "./sizes"

export type SizeChartUnit = "cm" | "in"

export type SizeChartColumn = { key: string; label: string }

export type SizeChartRow = {
  size: string
  /** By column key; null when the row has no value for that column. */
  values: Record<string, number | null>
}

export type SizeChart = {
  draft: boolean
  unit: SizeChartUnit
  columns: SizeChartColumn[]
  rows: SizeChartRow[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isUnit = (value: unknown): value is SizeChartUnit =>
  value === "cm" || value === "in"

const warn = (message: string) => {
  if (process.env.NODE_ENV === "development") {
    console.warn(`size_chart: ${message}; the chart is not shown.`)
  }
}

/**
 * `metadata.size_chart` as a SizeChart, or null when there is nothing to
 * show. Missing or with no rows: null quietly. Bad data (no columns, a row
 * without `values`, an unknown unit): null, with a console warning in
 * development (05, 3.6 "Error").
 */
export const parseSizeChart = (
  metadata: Record<string, unknown> | null | undefined
): SizeChart | null => {
  const raw = metadata?.size_chart
  if (raw === undefined || raw === null) {
    return null
  }
  if (!isObject(raw)) {
    warn("not an object")
    return null
  }
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    return null
  }
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) {
    warn("no columns")
    return null
  }
  if (!isUnit(raw.unit)) {
    warn(`unknown unit ${JSON.stringify(raw.unit)}`)
    return null
  }

  const columns: SizeChartColumn[] = []
  for (const column of raw.columns) {
    if (
      !isObject(column) ||
      typeof column.key !== "string" ||
      typeof column.label !== "string" ||
      !column.key
    ) {
      warn("a column without a key or label")
      return null
    }
    columns.push({ key: column.key, label: column.label })
  }

  const rows: SizeChartRow[] = []
  for (const row of raw.rows) {
    if (!isObject(row) || typeof row.size !== "string" || !isObject(row.values)) {
      warn("a row without a size or values")
      return null
    }
    const rowValues = row.values
    const values = Object.fromEntries(
      columns.map(({ key }) => {
        const value = rowValues[key]
        return [
          key,
          typeof value === "number" && Number.isFinite(value) ? value : null,
        ]
      })
    )
    rows.push({ size: row.size, values })
  }

  return { draft: raw.draft === true, unit: raw.unit, columns, rows }
}

/** Whether the product has a chart to show. */
export const hasSizeChart = (
  product: { metadata?: Record<string, unknown> | null } | null | undefined
): boolean => parseSizeChart(product?.metadata) !== null

const CM_PER_INCH = 2.54

/**
 * A measurement in the unit the visitor chose. In the chart's own unit it
 * is shown as stored, with no rounding; converted, to 1 decimal place
 * (cm ÷ 2.54 for inches). Null stays null ("not measured").
 */
export const displayMeasurement = (
  value: number | null,
  stored: SizeChartUnit,
  shown: SizeChartUnit
): string | null => {
  if (value === null) {
    return null
  }
  if (stored === shown) {
    return String(value)
  }
  const converted = shown === "in" ? value / CM_PER_INCH : value * CM_PER_INCH
  return converted.toFixed(1)
}

export type SizeChartTableRow =
  | { kind: "group"; key: OptionValueGroup["key"]; label: string }
  | { kind: "size"; row: SizeChartRow }

/**
 * The table's rows in order: the sizes grouped as the size picker groups
 * them (lib/util/sizes.ts), Youth then Adult, each with a group row before
 * it. A chart with one group only gets no group row.
 */
export const sizeChartTableRows = (chart: SizeChart): SizeChartTableRow[] => {
  const groups = groupOptionValues(
    "Size",
    chart.rows.map((row) => row.size)
  )
  const bySize = new Map(chart.rows.map((row) => [row.size, row]))
  const labelled = groups.length > 1

  return groups.flatMap((group) => [
    ...(labelled && group.label
      ? [{ kind: "group" as const, key: group.key, label: group.label }]
      : []),
    ...group.values.map((size) => ({ kind: "size" as const, row: bySize.get(size)! })),
  ])
}

/** The size chosen on the page matches this row (sizes compare case-blind). */
export const isChosenSize = (size: string, chosen: string | undefined): boolean =>
  !!chosen && size.trim().toUpperCase() === chosen.trim().toUpperCase()

/**
 * Where the sheet's body scrolls to when it opens (05, 3.4). Positions are
 * in pixels from the top of the body's content.
 *
 * - It scrolls only as far as needed to show the chosen size's row with
 *   `room` to spare below it, so the row is not left on the bottom edge.
 * - It never scrolls past `keepTop`, the top of the draft note when there is
 *   one: the note is seen before the numbers. The chosen row can then still
 *   be reached by scrolling.
 * - Without a note it never scrolls past the row's own top.
 */
export const openingScrollTop = ({
  viewHeight,
  rowTop,
  rowBottom,
  keepTop,
  room = 0,
}: {
  viewHeight: number
  rowTop: number
  rowBottom: number
  keepTop?: number | null
  room?: number
}): number => {
  const needed = rowBottom + room - viewHeight
  if (needed <= 0) {
    return 0
  }
  const limit = typeof keepTop === "number" ? keepTop : rowTop
  return Math.max(0, Math.min(needed, limit))
}

/** The unit the visitor last chose this visit, kept in sessionStorage. */
export const UNIT_STORAGE_KEY = "fitmyoutfit:size-chart-unit"

export const readStoredUnit = (
  storage: Pick<Storage, "getItem"> | null | undefined
): SizeChartUnit | null => {
  try {
    const value = storage?.getItem(UNIT_STORAGE_KEY)
    return isUnit(value) ? value : null
  } catch {
    return null
  }
}
