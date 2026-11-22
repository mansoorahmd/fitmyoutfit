/**
 * The words and colours of the team-order admin pages (src/admin/lib/team-orders.ts), and the pages'
 * source checked as text (the admin has no React test setup in this package, as for the Cash on
 * delivery panel): the buttons are the backend's list and each asks for confirmation.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  daysLeftText,
  errorText,
  formatDay,
  formatTime,
  kindLabel,
  personText,
  playersText,
  proofStatusColor,
  proofStatusLabel,
  rangeText,
  scheduleColor,
  scheduleLabel,
  shortHash,
  sizesText,
  statusColor,
  statusLabel,
  STATUSES,
  stepText,
} from "../lib/team-orders"

describe("statuses, kinds, proofs and schedule states have words and colours", () => {
  it("every status of the flow", () => {
    expect(STATUSES.map(statusLabel)).toEqual([
      "Draft",
      "Proof sent",
      "Approved",
      "Deposit paid",
      "In production",
      "Balance due",
      "Shipped",
    ])
    for (const status of STATUSES) expect(statusColor(status)).toMatch(/^(green|orange|red|grey|blue|purple)$/)
    expect(statusColor("shipped")).toBe("green")
    expect(statusLabel("something else")).toBe("something else")
    expect(statusColor("something else")).toBe("grey")
  })

  it("add-ons and reorders are named, an ordinary order is not", () => {
    expect(kindLabel("add_on")).toBe("Add-on")
    expect(kindLabel("reorder")).toBe("Reorder")
    expect(kindLabel("order")).toBe("")
  })

  it("proof and schedule states", () => {
    expect(proofStatusLabel("signed")).toBe("Signed")
    expect(proofStatusColor("signed")).toBe("green")
    expect(proofStatusColor("withdrawn")).toBe("grey")
    expect(scheduleLabel("needs_rush")).toBe("Needs rush")
    expect(scheduleColor("cannot_be_met")).toBe("red")
    expect(scheduleLabel("none")).toBe("No date")
  })
})

describe("formatting", () => {
  it("days, in words with no time zone arithmetic", () => {
    expect(formatDay("2026-12-03")).toBe("3 Dec 2026")
    expect(formatDay(null)).toBe("-")
    expect(formatDay("soon")).toBe("soon")
  })

  it("times", () => {
    expect(formatTime(null)).toBe("-")
    expect(formatTime("not a time")).toBe("not a time")
    expect(formatTime("2026-12-03T10:05:00Z")).toMatch(/2026/)
  })

  it("people, players and sizes", () => {
    expect(personText({ id: "c", name: "Ali Khan", email: "ali@example.com" })).toBe("Ali Khan (ali@example.com)")
    expect(personText({ id: "c", name: "", email: "ali@example.com" })).toBe("ali@example.com")
    expect(personText({ id: "c", name: "", email: null })).toBe("c")
    expect(personText(null)).toBe("-")
    expect(playersText(1, 1)).toBe("1 player")
    expect(playersText(12, 12)).toBe("12 players")
    expect(playersText(5, 7)).toBe("5 players, 7 pieces")
    expect(sizesText([{ size: "S", pieces: 3 }, { size: "M", pieces: 0 }, { size: "L", pieces: 4 }], [{ size: "kid", pieces: 1 }])).toBe(
      "S 3, L 4, kid 1"
    )
    expect(sizesText([{ size: "S", pieces: 0 }])).toBe("-")
  })

  it("days left to sign, the page range and a short hash", () => {
    expect(daysLeftText(3)).toBe("3 days left to sign")
    expect(daysLeftText(1)).toBe("1 day left to sign")
    expect(daysLeftText(0)).toBe("last day to sign is today")
    expect(daysLeftText(-2)).toBe("2 days past the latest day to sign")
    expect(daysLeftText(-1)).toBe("1 day past the latest day to sign")
    expect(daysLeftText(null)).toBeNull()
    expect(rangeText(0, 20, 53)).toBe("1-20 of 53")
    expect(rangeText(40, 13, 53)).toBe("41-53 of 53")
    expect(rangeText(0, 0, 0)).toBe("0")
    expect(shortHash("a".repeat(32) + "b".repeat(32))).toBe("aaaaaaaa...bbbbbbbb")
    expect(shortHash("abc")).toBe("abc")
  })

  it("a record of a step says what happened", () => {
    expect(stepText({ step_name: "make_proof", from: "draft", to: "proof_sent" })).toBe("Draft to proof sent")
    expect(stepText({ step_name: "pay_deposit", from: "approved", to: "deposit_paid" })).toBe("Deposit marked as received")
    expect(stepText({ step_name: "balance_received_by_hand", from: "balance_due", to: "balance_due" })).toBe("Balance marked as received")
  })

  it("an error shows the backend's sentence, else the status", () => {
    expect(errorText({ message: "Nope." }, 400)).toBe("Nope.")
    expect(errorText({}, 500)).toBe("Error 500")
    expect(errorText(null, 404)).toBe("Error 404")
  })
})

describe("the pages' source", () => {
  const list = readFileSync(join(__dirname, "..", "routes", "team-orders", "page.tsx"), "utf8")
  const detail = readFileSync(join(__dirname, "..", "routes", "team-orders", "[id]", "page.tsx"), "utf8")

  it("the list has the menu entry, the status filter, paging and a link to each order", () => {
    expect(list).toMatch(/defineRouteConfig\(\{\s*label: "Team orders"/)
    expect(list).toMatch(/\/admin\/team-orders\?/)
    expect(list).toMatch(/Filter by status/)
    expect(list).toMatch(/Table\.Pagination/)
    expect(list).toMatch(/navigate\(`\/team-orders\/\$\{order\.id\}`\)/)
  })

  it("the buttons are the backend's actions, and each asks for a confirmation before the step is sent", () => {
    expect(detail).toMatch(/data\.actions\.map/)
    expect(detail).toMatch(/usePrompt\(\)/)
    expect(detail).toMatch(/description: action\.confirm/)
    expect(detail).toMatch(/if \(confirmed\) step\.mutate\(action\)/)
    expect(detail).toMatch(/\/steps/)
    // no button of the page's own: nothing is offered that the backend did not list
    expect(detail.match(/<Button/g)?.length).toBe(1)
  })

  it("the by-hand steps are labelled as such, and the page shows proofs, the address, the record of steps and the links", () => {
    expect(detail).toMatch(/marked "by hand"/)
    expect(detail).toMatch(/Signed from address/)
    expect(detail).toMatch(/Record of steps/)
    expect(detail).toMatch(/data\.links\.add_ons/)
    expect(detail).toMatch(/data\.links\.reorders/)
    expect(detail).toMatch(/proof\.snapshot\.lines/)
  })
})
