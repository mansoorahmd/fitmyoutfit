import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { leaveLinks } from "@lib/editor/leave-links"
import DesignerMenu from "@modules/design/components/designer-menu"

const links = leaveLinks({ countryCode: "pk", handle: "jersey", signedIn: true, orderId: "teamord_1", returnTo: "/design/jersey" })

describe("the designer's store menu", () => {
  it("is closed until pressed, then lists every link and says nothing is lost", () => {
    render(<DesignerMenu links={links} onLeave={vi.fn()} />)
    expect(screen.queryByTestId("designer-menu-panel")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Store menu" }))
    const panel = screen.getByTestId("designer-menu-panel")
    expect(panel).toHaveTextContent("saved before you leave")
    expect(within(panel).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Home",
      "Back to the product",
      "Change garment",
      "This team order",
      "Team orders",
      "Account",
    ])
  })

  it("a press on a link asks the designer to leave (it saves first) and does not change the page itself", () => {
    const onLeave = vi.fn()
    render(<DesignerMenu links={links} onLeave={onLeave} />)
    fireEvent.click(screen.getByRole("button", { name: "Store menu" }))
    const link = screen.getByTestId("designer-menu-chooser")
    expect(link).toHaveAttribute("href", "/pk/design")
    const notPrevented = fireEvent.click(link)
    expect(notPrevented).toBe(false)
    expect(onLeave).toHaveBeenCalledWith("/pk/design")
    expect(screen.queryByTestId("designer-menu-panel")).not.toBeInTheDocument()
  })

  it("a modified press (a new tab) is left to the browser", () => {
    const onLeave = vi.fn()
    render(<DesignerMenu links={links} onLeave={onLeave} />)
    fireEvent.click(screen.getByRole("button", { name: "Store menu" }))
    fireEvent.click(screen.getByTestId("designer-menu-home"), { ctrlKey: true })
    expect(onLeave).not.toHaveBeenCalled()
  })

  it("closes on Escape", () => {
    render(<DesignerMenu links={links} onLeave={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Store menu" }))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByTestId("designer-menu-panel")).not.toBeInTheDocument()
  })
})
