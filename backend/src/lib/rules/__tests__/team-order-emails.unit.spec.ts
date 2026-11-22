import { addCalendarDays } from "../delivery-promise"
import { dedupeKey, mayRetry, MAX_EMAIL_ATTEMPTS, PENDING_RETRY_AFTER_MINUTES, reminderDue } from "../team-order-emails"
import { scheduleFor } from "../team-order-schedule"

const DAYS = { standard: 15, rush: 10 }

/** The schedule for an order that needs the kit on `needBy`, as of `today`. */
const schedule = (needBy: string | null, today: string) => scheduleFor({ needBy, today, days: DAYS })

describe("reminderDue: the reminder day arithmetic", () => {
  const needBy = "2026-12-31"
  const latest = addCalendarDays(needBy, -15) // 2026-12-16
  const latestRush = addCalendarDays(needBy, -10) // 2026-12-21

  it("the latest day to sign is the need-by date minus the standard days", () => {
    expect(latest).toBe("2026-12-16")
    expect(schedule(needBy, "2026-12-01").latest_sign_standard).toBe(latest)
  })

  it("3 days before the latest day: the 3-day reminder, naming that day", () => {
    expect(reminderDue({ status: "draft" }, schedule(needBy, addCalendarDays(latest, -3)))).toEqual({
      kind: "reminder_3d",
      target: "standard",
      latestSignDay: latest,
      daysLeft: 3,
    })
  })

  it("1 day before the latest day: the 1-day reminder", () => {
    expect(reminderDue({ status: "proof_sent" }, schedule(needBy, addCalendarDays(latest, -1)))).toEqual({
      kind: "reminder_1d",
      target: "standard",
      latestSignDay: latest,
      daysLeft: 1,
    })
  })

  it("no reminder on the other days: earlier, 2 days, the latest day itself", () => {
    for (const offset of [-10, -4, -2, 0]) {
      expect(reminderDue({ status: "draft" }, schedule(needBy, addCalendarDays(latest, offset)))).toBeNull()
    }
  })

  it("standard day past and rush still works: the rush day, 3 and 1 days before it", () => {
    // Between the two latest days the schedule is needs_rush; the rush day counts then.
    const threeBefore = addCalendarDays(latestRush, -3) // 2026-12-18: 2 days after the standard day
    expect(schedule(needBy, threeBefore).state).toBe("needs_rush")
    expect(reminderDue({ status: "draft" }, schedule(needBy, threeBefore))).toEqual({
      kind: "reminder_3d",
      target: "rush",
      latestSignDay: latestRush,
      daysLeft: 3,
    })
    expect(reminderDue({ status: "draft" }, schedule(needBy, addCalendarDays(latestRush, -1)))).toMatchObject({
      kind: "reminder_1d",
      target: "rush",
      latestSignDay: latestRush,
    })
  })

  it("while standard still works the standard day counts, never the rush day", () => {
    // 9 days before the rush day is 4 days before the standard day: nothing yet (the rush day is 5 days after).
    expect(reminderDue({ status: "draft" }, schedule(needBy, addCalendarDays(latestRush, -9)))).toBeNull()
  })

  it("after the rush day, or without a need-by date, nothing", () => {
    expect(reminderDue({ status: "draft" }, schedule(needBy, addCalendarDays(latestRush, 1)))).toBeNull()
    expect(reminderDue({ status: "draft" }, schedule(null, "2026-12-01"))).toBeNull()
  })

  it("only draft and proof_sent orders are reminded", () => {
    const day = schedule(needBy, addCalendarDays(latest, -3))
    expect(reminderDue({ status: "draft" }, day)?.kind).toBe("reminder_3d")
    expect(reminderDue({ status: "proof_sent" }, day)?.kind).toBe("reminder_3d")
    for (const status of ["approved", "deposit_paid", "in_production", "balance_due", "shipped"]) {
      expect(reminderDue({ status }, day)).toBeNull()
    }
  })

  it("follows other delivery days (a setting, not a number in the rule)", () => {
    const quick = scheduleFor({ needBy: "2026-12-31", today: "2026-12-25", days: { standard: 3, rush: 2 } })
    expect(quick.latest_sign_standard).toBe("2026-12-28")
    expect(reminderDue({ status: "draft" }, quick)).toMatchObject({ kind: "reminder_3d", latestSignDay: "2026-12-28" })
  })
})

describe("dedupeKey", () => {
  it("one key per proof for the proof and the deposit, one per order for the balance", () => {
    expect(dedupeKey("proof_ready", { orderId: "o", proofId: "p1" })).toBe("proof_ready:p1")
    expect(dedupeKey("deposit_due", { orderId: "o", proofId: "p1" })).toBe("deposit_due:p1")
    expect(dedupeKey("balance_due", { orderId: "o", proofId: "p1" })).toBe("balance_due:o")
  })

  it("a reminder is once per order, kind and latest day", () => {
    const a = dedupeKey("reminder_3d", { orderId: "o", latestSignDay: "2026-12-16" })
    expect(a).toBe("reminder_3d:o:2026-12-16")
    expect(dedupeKey("reminder_1d", { orderId: "o", latestSignDay: "2026-12-16" })).not.toBe(a)
    expect(dedupeKey("reminder_3d", { orderId: "o", latestSignDay: "2026-12-20" })).not.toBe(a)
    expect(dedupeKey("reminder_3d", { orderId: "o2", latestSignDay: "2026-12-16" })).not.toBe(a)
  })
})

describe("mayRetry", () => {
  const now = new Date("2026-12-01T10:00:00Z")
  it("never a sent email, or one tried the most times", () => {
    expect(mayRetry({ status: "sent", attempts: 1, lastAttemptAt: null }, now)).toBe(false)
    expect(mayRetry({ status: "failed", attempts: MAX_EMAIL_ATTEMPTS, lastAttemptAt: null }, now)).toBe(false)
  })

  it("a failed one, any time before the limit", () => {
    expect(mayRetry({ status: "failed", attempts: 1, lastAttemptAt: now }, now)).toBe(true)
    expect(mayRetry({ status: "failed", attempts: MAX_EMAIL_ATTEMPTS - 1, lastAttemptAt: now }, now)).toBe(true)
  })

  it("a pending one only after a wait (the send may still be running)", () => {
    const recent = new Date(now.getTime() - (PENDING_RETRY_AFTER_MINUTES - 1) * 60_000)
    const old = new Date(now.getTime() - PENDING_RETRY_AFTER_MINUTES * 60_000)
    expect(mayRetry({ status: "pending", attempts: 1, lastAttemptAt: recent }, now)).toBe(false)
    expect(mayRetry({ status: "pending", attempts: 1, lastAttemptAt: old }, now)).toBe(true)
    expect(mayRetry({ status: "pending", attempts: 0, lastAttemptAt: null }, now)).toBe(true)
  })
})
