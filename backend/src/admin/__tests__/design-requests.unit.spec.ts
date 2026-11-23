import { DESIGN_REQUEST_STATUSES } from "../../lib/rules/design-request"
import {
  confirmText,
  errorText,
  formatDay,
  formatTime,
  LINK_WARNING,
  piecesText,
  productLabel,
  rangeText,
  regionLabel,
  statusColor,
  statusLabel,
  stepText,
  STATUSES,
} from "../lib/design-requests"

describe("the design request pages' words", () => {
  it("know the same four statuses as the backend, in the same order", () => {
    expect([...STATUSES]).toEqual([...DESIGN_REQUEST_STATUSES])
  })

  it("name each status and give it a colour", () => {
    expect(STATUSES.map(statusLabel)).toEqual(["New", "In progress", "Proof sent", "Done"])
    expect(STATUSES.map(statusColor)).toEqual(["orange", "blue", "purple", "green"])
    expect(statusLabel("mystery")).toBe("mystery")
    expect(statusColor("mystery")).toBe("grey")
  })

  it("write products, regions, pieces and dates", () => {
    expect(productLabel("t-shirt")).toBe("T-shirt")
    expect(productLabel(null)).toBe("-")
    expect(productLabel("hat")).toBe("hat")
    expect(regionLabel("ae")).toBe("UAE")
    expect(regionLabel("zz")).toBe("zz")
    expect(piecesText(1)).toBe("1 piece")
    expect(piecesText(25)).toBe("25 pieces")
    expect(piecesText(null)).toBe("-")
    expect(formatDay("2026-12-05")).toBe("5 Dec 2026")
    expect(formatDay(null)).toBe("-")
    expect(formatDay("soon")).toBe("soon")
    expect(formatTime(null)).toBe("-")
    expect(formatTime("not a time")).toBe("not a time")
    expect(formatTime("2026-12-05T10:30:00Z")).toMatch(/5 Dec 2026/u)
  })

  it("write a refusal's message, or its status", () => {
    expect(errorText({ message: "Nope." }, 400)).toBe("Nope.")
    expect(errorText({}, 500)).toBe("Error 500")
    expect(errorText(null, 404)).toBe("Error 404")
  })

  it("describe a step, a range and the question before a move", () => {
    expect(stepText({ from: "new", to: "in_progress" })).toBe("New to In progress")
    expect(rangeText(0, 0, 0)).toBe("0 of 0")
    expect(rangeText(20, 5, 25)).toBe("21 to 25 of 25")
    expect(confirmText("proof_sent", "done")).toContain('"Proof sent" to "Done"')
  })

  it("warn that a stranger's links are not clickable", () => {
    expect(LINK_WARNING).toMatch(/stranger/u)
    expect(LINK_WARNING).toMatch(/not clickable/u)
  })
})
