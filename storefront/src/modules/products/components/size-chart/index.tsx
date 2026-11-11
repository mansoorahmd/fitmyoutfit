"use client"

import { useEffect, useRef, useState } from "react"

import { productContent } from "@content/product"
import {
  SizeChart,
  SizeChartUnit,
  UNIT_STORAGE_KEY,
  openingScrollTop,
  readStoredUnit,
} from "@lib/util/size-chart"
import Alert from "@modules/common/components/alert"
import { ButtonLink } from "@modules/common/components/button"
import Sheet from "@modules/common/components/sheet"

import SizeChartTable from "./size-chart-table"
import UnitSwitch from "./unit-switch"

const sessionStore = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** One table row's height (05, 3.4): the room left below the chosen row. */
const ROW_ROOM_PX = 44

/** The nearest ancestor that scrolls up and down (the sheet's body). */
const scrollParent = (element: HTMLElement): HTMLElement | null => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") {
      return node
    }
  }
  return null
}

/** Scrolls the sheet's body as `openingScrollTop` says. */
const scrollToChosenRow = (row: HTMLElement | null, note: HTMLElement | null) => {
  const view = row ? scrollParent(row) : null
  if (!row || !view) {
    return
  }
  const viewTop = view.getBoundingClientRect().top - view.scrollTop
  const offset = (element: HTMLElement) => element.getBoundingClientRect().top - viewTop
  const rowTop = offset(row)
  view.scrollTop = openingScrollTop({
    viewHeight: view.clientHeight,
    rowTop,
    rowBottom: rowTop + row.getBoundingClientRect().height,
    keepTop: note ? offset(note) : null,
    room: ROW_ROOM_PX,
  })
}

/**
 * The chart's unit: the chart's own unit at first, then the visitor's last
 * choice for this visit (sessionStorage). Read after mount, so the server
 * and the first render in the browser agree.
 */
const useChartUnit = (stored: SizeChartUnit) => {
  const [unit, setUnit] = useState<SizeChartUnit>(stored)

  useEffect(() => {
    const remembered = readStoredUnit(sessionStore())
    if (remembered) setUnit(remembered)
  }, [])

  const choose = (next: SizeChartUnit) => {
    setUnit(next)
    try {
      sessionStore()?.setItem(UNIT_STORAGE_KEY, next)
    } catch {
      // private browsing may refuse storage; the choice still holds for now
    }
  }

  return [unit, choose] as const
}

type SizeChartBodyProps = {
  chart: SizeChart
  productTitle: string
  chosenSize?: string
  /** "Not sure? See the fit kit": hidden on the fit kit's own page. */
  showFitKitLink: boolean
  scrollToChosen?: boolean
}

/**
 * The chart's content, in the order of docs/design/05-m1-pages.md, 3.4: the
 * draft note (only for `draft: true`), the unit switch, "Measured on the
 * garment laid flat.", the table and the fit kit link. The diagram is left
 * out until the pattern maker confirms the measuring points (3.6).
 */
export const SizeChartBody = ({
  chart,
  productTitle,
  chosenSize,
  showFitKitLink,
  scrollToChosen,
}: SizeChartBodyProps) => {
  const words = productContent.sizeChart
  const [unit, setUnit] = useChartUnit(chart.unit)
  const noteRef = useRef<HTMLDivElement>(null)
  const chosenRowRef = useRef<HTMLTableRowElement>(null)

  // In the sheet, bring the chosen size towards view when it opens, without
  // scrolling the draft note away. Never on the page itself, which must not move.
  useEffect(() => {
    if (scrollToChosen) {
      scrollToChosenRow(chosenRowRef.current, noteRef.current)
    }
  }, [scrollToChosen])

  return (
    <div className="flex flex-col gap-4" data-testid="size-chart">
      {chart.draft && (
        <Alert
          ref={noteRef}
          variant="info"
          title={words.draftTitle}
          data-testid="size-chart-draft"
        >
          {words.draftText}
        </Alert>
      )}
      <UnitSwitch value={unit} onChange={setUnit} />
      <p className="type-small text-brand-ink-muted">{words.howWeMeasure}</p>
      <SizeChartTable
        chart={chart}
        unit={unit}
        productTitle={productTitle}
        chosenSize={chosenSize}
        chosenRowRef={chosenRowRef}
      />
      {showFitKitLink && (
        <ButtonLink
          href={words.fitKitLink.href}
          variant="text"
          className="-ml-1 self-start"
          data-testid="size-chart-fit-kit"
        >
          {words.fitKitLink.label}
        </ButtonLink>
      )}
    </div>
  )
}

/** The size chart as a bottom sheet on phones and a dialog from 768 px (05, 3.4). */
export const SizeChartSheet = ({
  open,
  onClose,
  ...body
}: SizeChartBodyProps & { open: boolean; onClose: () => void }) => (
  <Sheet
    open={open}
    onClose={onClose}
    title={productContent.sizeChart.title}
    subtitle={<bdi>{body.productTitle}</bdi>}
    closeLabel={productContent.sizeChart.close}
    data-testid="size-chart-sheet"
  >
    <SizeChartBody {...body} scrollToChosen />
  </Sheet>
)
