import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Uses the real content file: these tests pin the draft wording the brief
// gives, so a component that hard-codes or drops a line fails here.
vi.mock("next/navigation", () => ({ useParams: () => ({ countryCode: "pk" }) }))
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

import { homeContent } from "@content/home"
import HowItWorks from "@modules/home/components/how-it-works"
import PromiseStrip from "@modules/home/components/promise-strip"
import Questions from "@modules/home/components/questions"
import RosterProof from "@modules/home/components/roster-proof"
import Sizing from "@modules/home/components/sizing"

const classesOf = (el: Element) => el.className.split(/\s+/)

describe("promise strip", () => {
  it("shows Pakistan the three promises and the payment methods", () => {
    render(<PromiseStrip countryCode="pk" />)

    const items = screen.getAllByTestId("promise-item")
    expect(items.map((li) => [
      within(li).getByRole("heading", { level: 3 }).textContent,
      li.querySelector("p")?.textContent,
    ])).toEqual([
      ["Delivered in 15 days", "From the day you approve your proof. 10 days with paid rush."],
      ["Free design help", "For teams. Tell us the idea and we set up the kit with you."],
      ["Free replacement", "Within 7 days, if the mistake is ours."],
      ["Pay your way", "JazzCash, Easypaisa or card."],
    ])
  })

  it("shows other regions shipping and duties instead of payment", () => {
    render(<PromiseStrip countryCode="gb" />)

    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(titles).toHaveLength(4)
    expect(titles[3]).toBe("Shipping and duties included")
    expect(
      screen.getByText("One box to the organizer, every jersey bagged and labelled.")
    ).toBeInTheDocument()
    expect(screen.queryByText("Pay your way")).not.toBeInTheDocument()
  })

  it("gives every item a decorative inline line icon", () => {
    render(<PromiseStrip countryCode="pk" />)

    for (const item of screen.getAllByTestId("promise-item")) {
      const svg = item.querySelector("svg")!
      expect(svg).toHaveAttribute("aria-hidden", "true")
      expect(svg).toHaveAttribute("stroke", "currentColor")
    }
  })

  it("is two by two on phones and four across from 768 px", () => {
    render(<PromiseStrip countryCode="pk" />)

    const list = screen.getAllByTestId("promise-item")[0].parentElement!
    expect(classesOf(list)).toEqual(expect.arrayContaining(["grid-cols-2", "md:grid-cols-4"]))
  })

  it("has a heading for screen readers so the item titles are not orphaned", () => {
    render(<PromiseStrip countryCode="pk" />)

    const heading = screen.getByRole("heading", { level: 2 })
    expect(heading).toHaveClass("sr-only")
    expect(screen.getByTestId("promise-strip")).toHaveAttribute(
      "aria-labelledby",
      heading.id
    )
  })
})

describe("how team orders work", () => {
  it("has the four steps in order, the payment line and the main button", () => {
    render(<HowItWorks />)

    expect(
      screen.getByRole("heading", { level: 2, name: "How team orders work" })
    ).toBeInTheDocument()
    const list = screen.getByRole("list")
    expect(list.tagName).toBe("OL")
    expect(within(list).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Design your kit in 3D.",
      "Add your players in one list: name, number and size.",
      "See each player's shirt, then check and sign the roster proof.",
      "We make and deliver the kit.",
    ])
    expect(screen.getByTestId("how-it-works-payment")).toHaveTextContent(
      "The organizer pays 50% when the proof is approved and 50% before shipping."
    )
    const button = screen.getByRole("link", { name: "Start your team kit" })
    expect(button).toHaveAttribute("href", "/pk/store")
    expect(button.className).toContain("bg-brand-primary")
  })

  it("can be jumped to by its id, clear of the sticky header", () => {
    render(<HowItWorks />)

    const section = screen.getByTestId("how-it-works")
    expect(section.id).toBe("how-team-orders-work")
    expect(classesOf(section)).toEqual(
      expect.arrayContaining(["scroll-mt-14", "md:scroll-mt-16", "xl:scroll-mt-[72px]"])
    )
  })

  it("sits on navy with the accent for the numbers, a list on phones and four columns at 1280 px", () => {
    render(<HowItWorks />)

    expect(classesOf(screen.getByTestId("how-it-works"))).toContain("bg-brand-inverse")
    const numbers = screen.getAllByTestId("how-it-works-step").map((li) => li.querySelector("span")!)
    expect(numbers.map((n) => n.textContent)).toEqual(["01", "02", "03", "04"])
    for (const n of numbers) {
      expect(n.className).toContain("text-brand-accent")
      expect(n).toHaveAttribute("aria-hidden", "true")
    }
    expect(classesOf(screen.getByRole("list"))).toEqual(
      expect.arrayContaining(["grid-cols-1", "xl:grid-cols-4"])
    )
  })
})

describe("roster proof", () => {
  it("has the heading and the three points", () => {
    render(<RosterProof />)

    expect(
      screen.getByRole("heading", { level: 2, name: "One page everyone signs off" })
    ).toBeInTheDocument()
    expect(screen.getAllByTestId("roster-proof-point").map((li) => li.textContent)).toEqual([
      "Every name, number and size on one page.",
      "You sign it before we make anything.",
      "We check the finished kit against it at our hub in Lahore before it ships.",
    ])
  })

  it("is complete without a picture: no image, no empty box, three tiles across", () => {
    homeContent.rosterProof.image = null
    const { container } = render(<RosterProof />)

    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByTestId("roster-proof-image")).not.toBeInTheDocument()
    const list = screen.getAllByTestId("roster-proof-point")[0].parentElement!
    expect(classesOf(list)).toContain("md:grid-cols-3")
  })

  it("shows the optional picture beside the points when there is one", () => {
    homeContent.rosterProof.image = { src: "/proof.png", alt: "A roster proof page" }
    try {
      render(<RosterProof />)

      expect(screen.getByRole("img", { name: "A roster proof page" })).toBeInTheDocument()
      const list = screen.getAllByTestId("roster-proof-point")[0].parentElement!
      expect(classesOf(list)).not.toContain("md:grid-cols-3")
    } finally {
      homeContent.rosterProof.image = null
    }
  })
})

describe("sizing", () => {
  it("offers the fit kit with a secondary button", () => {
    render(<Sizing />)

    expect(
      screen.getByRole("heading", { level: 2, name: "Not sure of sizes?" })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Order a fit kit and try the sizes on first. The deposit is refundable.")
    ).toBeInTheDocument()
    const button = screen.getByRole("link", { name: "See the fit kit" })
    expect(button).toHaveAttribute("href", "/pk/products/fit-kit")
    expect(button.className).not.toContain("brand-primary")
    expect(button.className).toContain("border-brand-ink")
  })
})

describe("questions", () => {
  const shown = () =>
    screen.getAllByTestId("question").map((details) => [
      details.querySelector("summary")?.textContent,
      details.querySelector("p")?.textContent,
    ])

  it("are native details elements, closed at first", () => {
    render(<Questions countryCode="pk" />)

    for (const details of screen.getAllByTestId("question")) {
      expect(details.tagName).toBe("DETAILS")
      expect(details).not.toHaveAttribute("open")
      expect(details.querySelector("summary")).not.toBeNull()
    }
  })

  it("leaves the shipping question out in Pakistan", () => {
    render(<Questions countryCode="pk" />)

    expect(shown()).toEqual([
      ["How long does delivery take?", "15 days from the day you approve your proof, or 10 days with paid rush."],
      ["Do players have to pay?", "No. The organizer pays for the team: 50% when the proof is approved and 50% before shipping."],
      ["Can names be in Arabic or Urdu?", "Yes. Names can be in English, Arabic or Urdu, and numbers in English or Arabic digits."],
      ["What if something is wrong with our order?", "If the mistake is ours, we replace it free within 7 days."],
    ])
  })

  it("adds it in export regions", () => {
    render(<Questions countryCode="us" />)

    expect(shown()).toHaveLength(5)
    expect(shown()[4]).toEqual([
      "Who pays shipping and duties?",
      "For orders outside Pakistan, shipping and duties are included. The kit arrives in one box to the organizer.",
    ])
  })

  it("each question row is a tall enough target", () => {
    render(<Questions countryCode="pk" />)

    for (const summary of Array.from(document.querySelectorAll("summary"))) {
      expect(summary.className).toContain("min-h-[56px]")
    }
  })
})
