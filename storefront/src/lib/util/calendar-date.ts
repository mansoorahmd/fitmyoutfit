// Dates from the contract are calendar days, "YYYY-MM-DD", not instants
// (docs/design/05-m1-pages.md, 2.4). Read as local time, "2026-11-26" can
// become the 25th in the US, so the day is built in UTC and shown in UTC.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const toUtc = (isoDate: string): Date | null => {
  const match = ISO_DATE.exec(isoDate)
  if (!match) {
    return null
  }
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // reject 2026-02-31 and the like, which Date.UTC rolls over
  return date.getUTCDate() === d && date.getUTCMonth() === m - 1 ? date : null
}

const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
})

const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** "2026-11-26" to "Thursday 26 November". Null for anything else. */
export const formatDeliveryDate = (isoDate: string): string | null => {
  const date = toUtc(isoDate)
  // en-GB may put a comma after the weekday in some ICU versions
  return date ? WEEKDAY_DAY_MONTH.format(date).replace(",", "") : null
}

/** "2026-11-11" to "11 November 2026" (order dates). Null for anything else. */
export const formatCalendarDateWithYear = (isoDate: string): string | null => {
  const date = toUtc(isoDate)
  return date ? DAY_MONTH_YEAR.format(date) : null
}
