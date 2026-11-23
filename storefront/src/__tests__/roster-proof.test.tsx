import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { state } = vi.hoisted(() => ({ state: { signed: [] as unknown[], answer: null as unknown, refreshed: 0 } }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: () => void (state.refreshed += 1) }),
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={`/pk${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/team-orders", () => ({
  signProof: async (...args: unknown[]) => {
    state.signed.push(args)
    return state.answer
  },
  reopenTeamOrder: vi.fn(),
  makeProof: vi.fn(),
}))

import { apiAnswer, apiProof, apiSchedule, apiSnapshot } from "@lib/team-order/fixtures"
import { parseProofAnswer, parseTeamOrderAnswer, scheduleFromApi } from "@lib/team-order/map"
import { buildProofDocument } from "@lib/team-order/proof"
import { signingSchedule } from "@lib/team-order/signing"
import { parseSizeChart } from "@lib/util/size-chart"
import RosterProof from "@modules/team-order/components/roster-proof"
import SignProof from "@modules/team-order/components/sign-proof"

const chart = parseSizeChart({
  size_chart: { unit: "cm", draft: true, columns: [{ key: "chest", label: "Chest width" }, { key: "length", label: "Body length" }], rows: [{ size: "M", values: { chest: 54, length: 72 } }, { size: "L", values: { chest: 57, length: 74 } }] },
})
const proof = (over: Record<string, unknown> = {}, snapshot: Record<string, unknown> = {}) =>
  parseProofAnswer({ proof: { ...apiProof(over), snapshot: apiSnapshot(snapshot), snapshot_text: "t" } })!
const doc = (p = proof()) => buildProofDocument({ proof: p, productName: "Jersey", sizes: ["S", "M", "L"], chart, letterCase: "upper", needByDate: null })

describe("the roster proof", () => {
  it("shows every line of the snapshot: position, name as printed, number, size with its measurement, how many", () => {
    render(<RosterProof document={doc()} />)
    const rows = screen.getAllByTestId("proof-row")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByTestId("proof-name")).toHaveTextContent("BILAL")
    expect(within(rows[0]!).getByTestId("proof-number")).toHaveTextContent("7")
    expect(within(rows[0]!).getByTestId("proof-size")).toHaveTextContent("M54 × 72")
    expect(within(rows[1]!).getByTestId("proof-count")).toHaveTextContent("×2")
    expect(screen.getByTestId("proof-team")).toHaveTextContent("Lahore Lions")
    expect(screen.getByTestId("proof-code")).toHaveTextContent("Proof code aaaaaaaaaaaa")
  })

  it("shows Urdu and Arabic names unchanged, in their own isolated, auto-direction cell, with the digits as written", () => {
    render(<RosterProof document={doc()} />)
    const name = within(screen.getAllByTestId("proof-row")[1]!).getByTestId("proof-name-text")
    expect(name).toHaveTextContent("علی")
    expect(name.tagName).toBe("BDI")
    expect(name).toHaveAttribute("dir", "auto")
    expect(within(screen.getAllByTestId("proof-row")[1]!).getByTestId("proof-number")).toHaveTextContent("٧")
  })

  it("shows a spare shirt and no name / no number plainly, and the totals", () => {
    const p = proof({}, {
      lines: [
        { name: "", number: "", size: "M", count: 1, no_name: true, no_number: true },
        { name: "", number: "9", size: "L", count: 1, no_name: true, no_number: false },
        { name: "Sami", number: "", size: "L", count: 3, no_name: false, no_number: true },
      ],
    })
    render(<RosterProof document={doc(p)} />)
    const rows = screen.getAllByTestId("proof-row")
    expect(rows[0]).toHaveTextContent("Spare shirt")
    expect(rows[0]).toHaveTextContent("No number")
    expect(rows[1]).toHaveTextContent("No name")
    expect(rows[2]).toHaveTextContent("SAMI")
    expect(rows[2]).toHaveTextContent("No number")
    expect(screen.getByTestId("proof-players")).toHaveTextContent("3 players")
    expect(screen.getByTestId("proof-pieces")).toHaveTextContent("5 pieces")
    expect(screen.getAllByTestId("proof-size-total").map((e) => e.textContent)).toEqual(["M1", "L4"])
  })

  it("says the size chart is a draft, and what it measures", () => {
    render(<RosterProof document={doc()} />)
    expect(screen.getByTestId("proof-measurement-note")).toHaveTextContent("Chest width × Body length, in cm. The size chart is a draft")
  })

  it("has no column for a number the design does not print", () => {
    render(<RosterProof document={doc(proof({}, { prints: { name: true, number: false } }))} />)
    expect(screen.queryByTestId("proof-number")).toBeNull()
  })

  it("carries its own print stylesheet (one A4 page) and takes the pictures as a slot", () => {
    const { container } = render(<RosterProof document={doc()} pictures={<p data-testid="slot">pictures</p>} />)
    const css = container.querySelector("style")!.textContent!
    expect(css).toContain("@page { size: A4")
    expect(css).toContain("table-header-group")
    expect(screen.getByTestId("slot")).toBeInTheDocument()
  })

  it("says an earlier proof is not valid", () => {
    render(<RosterProof document={doc(proof({ status: "withdrawn", closed_at: "2026-11-23T09:30:00.000Z" }))} />)
    expect(screen.getByTestId("proof-signature")).toHaveTextContent("Withdrawn on 23 November 2026")
  })
})

describe("signing", () => {
  beforeEach(() => {
    state.signed = []
    state.refreshed = 0
    state.answer = { ok: true, value: parseTeamOrderAnswer(apiAnswer({ current_proof: apiProof({ status: "signed", signed_name: "Ali Raza", signed_at: "2026-11-23T09:30:00.000Z" }) }))! }
  })
  const form = (props: Partial<React.ComponentProps<typeof SignProof>> = {}) => {
    const onSigned = vi.fn()
    const onStale = vi.fn()
    render(
      <SignProof
        orderId="teamord_1"
        proof={{ id: "proof_1", hash: "a".repeat(64) }}
        schedule={signingSchedule(scheduleFromApi(apiSchedule({ state: "ok" }))!, false)}
        orderHref="/pk/account/team-orders/teamord_1"
        signedInPath="/account/team-orders/teamord_1/proof"
        statement="I have checked every name, number and size on this proof. I agree that the kit is made as shown."
        onSigned={onSigned}
        onStale={onStale}
        {...props}
      />
    )
    return { onSigned, onStale }
  }
  const fillIn = (name = "Ali Raza", tick = true) => {
    fireEvent.change(screen.getByTestId("sign-name").querySelector("input")!, { target: { value: name } })
    if (tick) fireEvent.click(screen.getByTestId("sign-tick").querySelector("input")!)
  }

  it("shows the statement and signs with the hash, the cleaned name, the box and the schedule state", async () => {
    const { onSigned } = form()
    expect(screen.getByTestId("sign-statement")).toHaveTextContent("I have checked every name, number and size")
    fillIn("  Ali   Raza ")
    fireEvent.click(screen.getByTestId("sign-submit"))
    await waitFor(() => expect(onSigned).toHaveBeenCalled())
    expect(state.signed).toEqual([["teamord_1", "proof_1", { proofHash: "a".repeat(64), signedName: "Ali Raza", confirmed: true, scheduleState: "ok" }]])
    expect(state.refreshed).toBe(1)
  })

  it("sends nothing without a name or without the box, and says which", () => {
    form()
    fireEvent.click(screen.getByTestId("sign-submit"))
    expect(screen.getByText("Type your full name to sign.")).toBeInTheDocument()
    fillIn("Ali", false)
    fireEvent.click(screen.getByTestId("sign-submit"))
    expect(screen.getByTestId("sign-tick-error")).toHaveTextContent("Tick the box to sign.")
    expect(state.signed).toHaveLength(0)
  })

  it("a double press signs once", async () => {
    const { onSigned } = form()
    fillIn()
    const button = screen.getByTestId("sign-submit")
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1))
    expect(state.signed).toHaveLength(1)
  })

  it("an out-of-date proof is refused in a sentence and the page reads the order again", async () => {
    state.answer = { ok: false, failure: { kind: "refused", status: 409, code: "proof_not_current" } }
    const { onStale, onSigned } = form()
    fillIn()
    fireEvent.click(screen.getByTestId("sign-submit"))
    await screen.findByTestId("sign-failure")
    expect(screen.getByTestId("sign-failure")).toHaveTextContent("Nothing was signed")
    expect(onStale).toHaveBeenCalled()
    expect(onSigned).not.toHaveBeenCalled()
    expect(state.refreshed).toBe(1)
  })

  it("a backend that is down says it could not sign, keeps the name and the box, and can be pressed again", async () => {
    state.answer = { ok: false, failure: { kind: "unavailable" } }
    form()
    fillIn()
    fireEvent.click(screen.getByTestId("sign-submit"))
    await screen.findByTestId("sign-failure")
    expect(screen.getByTestId("sign-failure")).toHaveTextContent("couldn't sign the proof")
    expect((screen.getByTestId("sign-name").querySelector("input") as HTMLInputElement).value).toBe("Ali Raza")
    expect((screen.getByTestId("sign-tick").querySelector("input") as HTMLInputElement).checked).toBe(true)
    state.answer = { ok: true, value: parseTeamOrderAnswer(apiAnswer({ current_proof: apiProof({ status: "signed" }) }))! }
    fireEvent.click(screen.getByTestId("sign-submit"))
    await waitFor(() => expect(state.signed).toHaveLength(2))
  })

  it("says rush and a date that cannot be met before signing, and sends that state", async () => {
    form({ schedule: signingSchedule(scheduleFromApi(apiSchedule({ state: "needs_rush", latest_sign_rush: "2026-11-24" }))!, false) })
    expect(screen.getByTestId("sign-schedule")).toHaveTextContent("Standard delivery is now too late")
    fillIn()
    fireEvent.click(screen.getByTestId("sign-submit"))
    await waitFor(() => expect(state.signed).toHaveLength(1))
    expect((state.signed[0] as unknown[])[2]).toMatchObject({ scheduleState: "needs_rush" })
  })
})
