import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { state } = vi.hoisted(() => ({
  state: {
    refreshed: 0,
    pushed: [] as string[],
    customer: "in" as "in" | "out" | "failed",
    order: null as unknown,
    list: null as unknown,
    products: [] as unknown[],
    schedule: [] as unknown[],
    scheduleAnswer: (() => ({ ok: true })) as (id: string, change: unknown) => unknown,
    renamed: [] as string[],
    renameAnswer: (() => ({ ok: true })) as (id: string, name: string) => unknown,
    deleted: [] as string[],
    deleteAnswer: (() => ({ ok: true, value: true })) as (id: string) => unknown,
  },
}))

class Redirected extends Error {
  constructor(public to: string) {
    super("NEXT_REDIRECT")
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (to: string) => {
    throw new Redirected(to)
  },
  useParams: () => ({ countryCode: "pk" }),
  useRouter: () => ({
    push: (to: string) => state.pushed.push(to),
    refresh: () => {
      state.refreshed += 1
    },
  }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={`/pk${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/customer", () => ({
  customerState: async () =>
    state.customer === "in"
      ? { kind: "signed_in", customer: { id: "cus_1", email: "organizer@example.com", first_name: "Sami", addresses: [] } }
      : state.customer === "out"
        ? { kind: "signed_out" }
        : { kind: "failed" },
  signout: async () => ({ href: "/pk/account" }),
}))
vi.mock("@lib/data/products", () => ({
  listProducts: async () => ({ response: { products: state.products } }),
}))
vi.mock("@lib/data/team-orders", () => ({
  listTeamOrders: async () => state.list,
  retrieveTeamOrder: async () => state.order,
  setTeamOrderSchedule: async (id: string, change: unknown) => {
    state.schedule.push(change)
    return state.scheduleAnswer(id, change)
  },
  renameTeamOrder: async (id: string, name: string) => {
    state.renamed.push(name)
    return state.renameAnswer(id, name)
  },
  deleteTeamOrder: async (id: string) => {
    state.deleted.push(id)
    return state.deleteAnswer(id)
  },
}))

import { apiAnswer, apiLine, apiSchedule, apiSummary } from "@lib/team-order/fixtures"
import { parseListItem, parseTeamOrderAnswer } from "@lib/team-order/map"
import TeamOrdersPage from "../app/[countryCode]/(main)/account/team-orders/page"
import TeamOrderPage from "../app/[countryCode]/(main)/account/team-orders/[id]/page"
import TeamOrderNotFound from "../app/[countryCode]/(main)/account/team-orders/[id]/not-found"

const view = (over: Parameters<typeof apiAnswer>[0] = {}) => ({ ok: true, value: parseTeamOrderAnswer(apiAnswer(over))! })
const item = (over: Record<string, unknown>) =>
  parseListItem({
    id: "teamord_1",
    team_name: "Lahore Lions",
    status: "draft",
    kind: "order",
    product_id: "prod_1",
    region_id: "reg_uk",
    need_by_date: null,
    players: 22,
    pieces: 24,
    created_at: "2026-11-22T10:00:00.000Z",
    ...over,
  })!

const jersey = { id: "prod_1", title: "Jersey", handle: "jersey", thumbnail: "http://localhost:9008/static/jersey.png" }

beforeEach(() => {
  state.refreshed = 0
  state.pushed = []
  state.customer = "in"
  state.products = [jersey]
  state.schedule = []
  state.scheduleAnswer = () => ({ ok: true, value: parseTeamOrderAnswer(apiAnswer())! })
  state.renamed = []
  state.renameAnswer = () => ({ ok: true, value: parseTeamOrderAnswer(apiAnswer())! })
  state.deleted = []
  state.deleteAnswer = () => ({ ok: true, value: true })
})

const openList = async () => render(await TeamOrdersPage({ params: Promise.resolve({ countryCode: "pk" }) }))
const openOrder = async (id = "teamord_1") => render(await TeamOrderPage({ params: Promise.resolve({ countryCode: "pk", id }) }))

describe("the list of team orders", () => {
  it("is signed out: the sign-in page, which comes back here", async () => {
    state.customer = "out"
    await expect(openList()).rejects.toMatchObject({ to: "/pk/account?view=signin&next=%2Faccount%2Fteam-orders" })
  })

  it("shows each order with its team, product, players and pieces, status in words and need-by date, in the order given (newest first)", async () => {
    state.list = {
      ok: true,
      value: [
        item({ id: "teamord_2", team_name: "نادی شیر", status: "proof_sent", need_by_date: "2026-12-20", players: 1, pieces: 1 }),
        item({ id: "teamord_1", team_name: "Lahore Lions" }),
      ],
    }
    await openList()
    const cards = screen.getAllByTestId("team-order-card")
    expect(cards.map((c) => c.getAttribute("data-order-id"))).toEqual(["teamord_2", "teamord_1"])
    expect(cards[0]).toHaveAttribute("href", "/pk/account/team-orders/teamord_2")
    expect(within(cards[0]).getByTestId("team-order-card-name")).toHaveTextContent("نادی شیر")
    expect(within(cards[0]).getByTestId("team-order-card-meta")).toHaveTextContent("1 player · 1 piece")
    expect(within(cards[0]).getByTestId("team-order-card-need-by")).toHaveTextContent("Needed by 20 December 2026")
    expect(within(cards[0]).getByTestId("team-order-status")).toHaveTextContent("Proof sent")
    expect(within(cards[1]).getByTestId("team-order-card-meta")).toHaveTextContent("22 players · 24 pieces")
    expect(within(cards[1]).getByTestId("team-order-card-need-by")).toHaveTextContent("No need-by date")
    expect(within(cards[1]).getByText("Jersey")).toBeInTheDocument()
  })

  it("empty: says so and leads to the designer", async () => {
    state.list = { ok: true, value: [] }
    await openList()
    const empty = screen.getByTestId("team-orders-empty")
    expect(empty).toHaveTextContent("No team orders yet")
    expect(within(empty).getByRole("link", { name: "Design your kit" })).toBeInTheDocument()
  })

  it("the store did not answer: says so with a way to try again", async () => {
    state.list = { ok: false, failure: { kind: "unavailable" } }
    await openList()
    expect(screen.getByTestId("team-orders-failed")).toHaveTextContent("We couldn't load your team orders")
    expect(screen.getByRole("link", { name: "Try again" })).toBeInTheDocument()
  })

  it("is in the account's menu", async () => {
    state.list = { ok: true, value: [] }
    await openList()
    expect(within(screen.getByTestId("account-menu-side")).getByRole("link", { name: "Team orders" })).toHaveAttribute("aria-current", "page")
  })
})

describe("one team order: the page", () => {
  it("signed out: the sign-in page, which comes back to the order", async () => {
    state.customer = "out"
    await expect(openOrder()).rejects.toMatchObject({ to: "/pk/account?view=signin&next=%2Faccount%2Fteam-orders%2Fteamord_1" })
  })

  it("another customer's order, an unknown one: the not-found page, with none of the order in it", async () => {
    state.order = { ok: false, failure: { kind: "not_found" } }
    await expect(openOrder("teamord_other")).rejects.toThrow("NEXT_NOT_FOUND")
    render(<TeamOrderNotFound />)
    expect(screen.getByTestId("team-order-not-found")).toHaveTextContent("We couldn't find this team order")
    expect(screen.getByRole("link", { name: /Back to your team orders/ })).toBeInTheDocument()
  })

  it("the store did not answer: the server-error block", async () => {
    state.order = { ok: false, failure: { kind: "unavailable" } }
    await openOrder()
    expect(screen.getByTestId("server-error")).toBeInTheDocument()
  })

  it("a draft: the team name, product with its picture, status in words, and the way into the designer", async () => {
    state.order = view()
    await openOrder()
    expect(screen.getByTestId("team-order-title")).toHaveTextContent("Lahore Lions")
    expect(screen.getByTestId("team-order-product")).toHaveTextContent("Jersey")
    expect(screen.getByTestId("team-order-picture").querySelector("img")).toHaveAttribute("src", jersey.thumbnail)
    expect(screen.getByTestId("team-order-status")).toHaveTextContent("Draft")
    expect(screen.getByTestId("team-order-status-text")).toHaveTextContent("You can still change the design and the team list.")
    expect(screen.getByTestId("team-order-edit")).toHaveTextContent("Edit design and team list")
    expect(screen.getByTestId("team-order-edit")).toHaveAttribute("href", "/pk/design/jersey?order=teamord_1")
    expect(screen.getByTestId("team-order-rename")).toBeInTheDocument()
    expect(screen.getByTestId("team-order-delete")).toBeInTheDocument()
    expect(screen.getByTestId("team-order-back")).toHaveAttribute("href", "/pk/account/team-orders")
  })

  it("says in one line that the proof is next and not open, and has no button for it (no dead button)", async () => {
    state.order = view()
    await openOrder()
    expect(screen.getByTestId("team-order-next")).toHaveTextContent("Next is the proof")
    expect(screen.getByTestId("team-order-next")).toHaveTextContent("It is not open yet.")
    const labels = [...screen.getAllByRole("button"), ...screen.getAllByRole("link")].map((e) => e.textContent ?? "")
    expect(labels.filter((l) => /proof|deposit|pay|\bsign (it|the|a|your)\b/i.test(l))).toEqual([])
  })

  it("the list's state: lines complete, pieces per size, and below the minimum or not, from the backend's answer", async () => {
    state.order = view()
    await openOrder()
    expect(screen.getByTestId("list-complete")).toHaveTextContent("All 2 lines complete")
    expect(screen.getByTestId("list-complete")).toHaveTextContent("3 pieces")
    const rows = screen.getAllByTestId("list-size-row").map((r) => r.textContent)
    expect(rows).toEqual(["M2", "L1"])
    expect(screen.getByTestId("list-minimum")).toHaveAttribute("data-met", "false")
    expect(screen.getByTestId("list-minimum")).toHaveTextContent("This order needs at least 10 pieces. 7 more needed.")
  })

  it("lines with a failed check: the line's place and name, and the problem in a sentence", async () => {
    state.order = view({
      roster: {
        lines: [apiLine(), apiLine({ id: "ln_2", name: "علی", number: "7", size: "" }), apiLine({ id: "ln_3", name: "", number: "7", size: "XXXL" })],
        problems: [
          { code: "size-missing", index: 1, line_id: "ln_2", field: "size", detail: null },
          { code: "number-duplicate", index: 1, line_id: "ln_2", field: "number", detail: { value: 7, others: [{ index: 0, id: "ln_1", name: "Bilal" }] } },
          { code: "size-unknown", index: 2, line_id: "ln_3", field: "size", detail: { size: "XXXL" } },
        ],
        summary: apiSummary({ players: 3, pieces: 3, lines_without_size: 1, pieces_without_size: 1, ready_lines: 1, lines_to_fix: 2, indexes_to_fix: [1, 2], minimum: { required: 10, missing: 7, met: false }, ready_for_proof: false }),
      },
    })
    await openOrder()
    expect(screen.getByTestId("list-complete")).toHaveTextContent("1 of 3 lines complete")
    const problems = screen.getAllByTestId("list-problem")
    expect(problems).toHaveLength(2)
    expect(problems[0]).toHaveTextContent("Line 2 · علی")
    expect(problems[0]).toHaveTextContent("Needs a size.")
    expect(problems[0]).toHaveTextContent("Same number as Bilal.")
    expect(problems[1]).toHaveTextContent("Line 3")
    expect(problems[1]).toHaveTextContent("XXXL is not a size of this product.")
    expect(screen.getByTestId("list-no-size")).toHaveTextContent("1 line has no size (1 piece).")
  })

  it("an empty list says so and points at the designer", async () => {
    state.order = view({ roster: { lines: [], summary: apiSummary({ players: 0, pieces: 0, by_size: [], ready_lines: 0, minimum: { required: 10, missing: 10, met: false } }) } })
    await openOrder()
    expect(screen.getByTestId("list-summary")).toHaveAttribute("data-state", "empty")
    expect(screen.getByTestId("list-summary")).toHaveTextContent("No players in the list yet.")
  })

  it("a region with a minimum of one piece (Pakistan) says nothing about a minimum", async () => {
    state.order = view({ roster: { summary: apiSummary({ minimum: { required: 1, missing: 0, met: true } }) } })
    await openOrder()
    expect(screen.queryByTestId("list-minimum")).not.toBeInTheDocument()
  })

  it("a list that meets the minimum says so", async () => {
    state.order = view({ roster: { summary: apiSummary({ minimum: { required: 10, missing: 0, met: true } }) } })
    await openOrder()
    expect(screen.getByTestId("list-minimum")).toHaveTextContent("This order meets the minimum of 10 pieces.")
  })

  it("no need-by date: says so, with the form to set one and no schedule sentence", async () => {
    state.order = view()
    await openOrder()
    expect(screen.getByTestId("need-by-current")).toHaveTextContent("No need-by date set.")
    expect(screen.queryByTestId("need-by-schedule")).toBeNull()
    expect(screen.getByTestId("need-by-save")).toHaveTextContent("Set the date")
  })

  it("ok: the latest day to sign, as the backend worked it out", async () => {
    state.order = view({
      team_order: { need_by_date: "2026-12-30" },
      schedule: apiSchedule({ state: "ok", need_by_date: "2026-12-30", latest_sign_standard: "2026-12-15", latest_sign_rush: "2026-12-20", days_left_standard: 23, days_left_rush: 28 }),
    })
    await openOrder()
    expect(screen.getByTestId("need-by-current")).toHaveTextContent("Needed by 30 December 2026.")
    expect(screen.getByTestId("need-by-schedule")).toHaveTextContent("The latest day to sign the proof is 15 December 2026.")
    expect(screen.queryByTestId("need-by-rush")).toBeNull()
  })

  it("needs rush: says so with the rush day and offers the choice; choosing sends it", async () => {
    state.order = view({
      team_order: { need_by_date: "2026-12-05" },
      schedule: apiSchedule({ state: "needs_rush", need_by_date: "2026-12-05", latest_sign_standard: "2026-11-20", latest_sign_rush: "2026-11-25", days_left_standard: -2, days_left_rush: 3 }),
    })
    await openOrder()
    expect(screen.getByTestId("need-by-schedule")).toHaveTextContent("With rush delivery, the latest day to sign the proof is 25 November 2026.")
    fireEvent.click(screen.getByTestId("need-by-rush-on"))
    await waitFor(() => expect(state.schedule).toEqual([{ rushRequested: true }]))
    await waitFor(() => expect(state.refreshed).toBe(1))
  })

  it("rush chosen: says it is a paid option and that payment is not open, with a way back", async () => {
    state.order = view({
      team_order: { need_by_date: "2026-12-05", rush_requested: true },
      schedule: apiSchedule({ state: "needs_rush", need_by_date: "2026-12-05", latest_sign_standard: "2026-11-20", latest_sign_rush: "2026-11-25" }),
    })
    await openOrder()
    expect(screen.getByTestId("need-by-rush")).toHaveTextContent("Rush delivery is chosen. It is a paid option; payment is not open yet.")
    expect(screen.getByTestId("need-by-rush-off")).toHaveTextContent("Keep standard delivery")
  })

  it("cannot be met: says so plainly", async () => {
    state.order = view({
      team_order: { need_by_date: "2026-11-25" },
      schedule: apiSchedule({ state: "cannot_be_met", need_by_date: "2026-11-25", latest_sign_standard: "2026-11-10", latest_sign_rush: "2026-11-15", days_left_standard: -12, days_left_rush: -7 }),
    })
    await openOrder()
    expect(screen.getByTestId("need-by-schedule")).toHaveTextContent("We can't meet this date, even with rush delivery")
    expect(screen.getByTestId("need-by-schedule")).toHaveTextContent("15 November 2026")
    expect(screen.queryByTestId("need-by-rush")).toBeNull()
  })

  it("setting a date sends it; a date that has passed says today's date from the backend", async () => {
    state.order = view()
    state.scheduleAnswer = () => ({ ok: false, failure: { kind: "refused", status: 400, code: "need_by_date_in_past", extra: { today: "2026-11-22" } } })
    await openOrder()
    fireEvent.change(screen.getByTestId("need-by-field").querySelector("input")!, { target: { value: "2020-01-01" } })
    fireEvent.click(screen.getByTestId("need-by-save"))
    await waitFor(() => expect(state.schedule).toEqual([{ needByDate: "2020-01-01" }]))
    expect(await screen.findByText("That day has already passed. Today is 22 November 2026.")).toBeInTheDocument()
    expect(state.refreshed).toBe(0)
  })

  it("clearing the date sends null", async () => {
    state.order = view({ team_order: { need_by_date: "2026-12-30" }, schedule: apiSchedule({ state: "ok", need_by_date: "2026-12-30", latest_sign_standard: "2026-12-15", latest_sign_rush: "2026-12-20" }) })
    await openOrder()
    fireEvent.click(screen.getByTestId("need-by-clear"))
    await waitFor(() => expect(state.schedule).toEqual([{ needByDate: null }]))
  })

  it("not a draft: the list and the date are fixed, no rename, no delete, and the designer button says 'See'", async () => {
    state.order = view({ team_order: { status: "approved", need_by_date: "2026-12-30" }, schedule: apiSchedule({ state: "ok", need_by_date: "2026-12-30", latest_sign_standard: "2026-12-15", latest_sign_rush: "2026-12-20" }) })
    await openOrder()
    expect(screen.getByTestId("team-order-status")).toHaveTextContent("Proof signed")
    expect(screen.queryByTestId("team-order-rename")).toBeNull()
    expect(screen.queryByTestId("team-order-delete")).toBeNull()
    expect(screen.queryByTestId("need-by-form")).toBeNull()
    expect(screen.getByTestId("team-order-edit")).toHaveTextContent("See design and team list")
    expect(screen.queryByTestId("team-order-next")).toBeNull()
  })

  it("a product with no designer has no button into one", async () => {
    state.products = [{ ...jersey, handle: "jacket" }]
    state.order = view()
    await openOrder()
    expect(screen.queryByTestId("team-order-edit")).toBeNull()
  })
})

describe("rename and delete", () => {
  it("rename sends the trimmed name and refreshes; 101 characters are refused before any call", async () => {
    state.order = view()
    await openOrder()
    fireEvent.click(screen.getByTestId("team-order-rename"))
    const input = screen.getByTestId("team-order-rename-field").querySelector("input")!
    fireEvent.change(input, { target: { value: "x".repeat(101) } })
    fireEvent.click(screen.getByTestId("team-order-rename-save"))
    expect(await screen.findByText("The team name must be 1 to 100 characters, with no line breaks.")).toBeInTheDocument()
    expect(state.renamed).toEqual([])
    fireEvent.change(input, { target: { value: "  لاہور  " } })
    fireEvent.click(screen.getByTestId("team-order-rename-save"))
    await waitFor(() => expect(state.renamed).toEqual(["لاہور"]))
    await waitFor(() => expect(state.refreshed).toBe(1))
  })

  it("a refused rename says why in a sentence of ours", async () => {
    state.order = view()
    state.renameAnswer = () => ({ ok: false, failure: { kind: "refused", status: 400, code: "team_order_not_editable", extra: { status: "proof_sent" } } })
    await openOrder()
    fireEvent.click(screen.getByTestId("team-order-rename"))
    fireEvent.click(screen.getByTestId("team-order-rename-save"))
    expect(await screen.findByText("This team order can't be changed now: the proof is out or signed.")).toBeInTheDocument()
  })

  it("delete asks first, and goes back to the list when it worked", async () => {
    state.order = view()
    await openOrder()
    fireEvent.click(screen.getByTestId("team-order-delete"))
    expect(state.deleted).toEqual([])
    expect(screen.getByTestId("team-order-delete-dialog")).toHaveTextContent("Delete this team order?")
    await act(async () => {
      fireEvent.click(screen.getByTestId("team-order-delete-confirm"))
    })
    await waitFor(() => expect(state.deleted).toEqual(["teamord_1"]))
    await waitFor(() => expect(state.pushed).toEqual(["/pk/account/team-orders"]))
  })

  it("a refused delete stays and says why", async () => {
    state.order = view()
    state.deleteAnswer = () => ({ ok: false, failure: { kind: "refused", status: 400, code: "team_order_not_draft" } })
    await openOrder()
    fireEvent.click(screen.getByTestId("team-order-delete"))
    await act(async () => {
      fireEvent.click(screen.getByTestId("team-order-delete-confirm"))
    })
    expect(await screen.findByTestId("team-order-delete-error")).toHaveTextContent("Only a draft team order can be deleted.")
    expect(state.pushed).toEqual([])
  })
})
