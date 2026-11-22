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
      "Change garmentA team order is for one garment. To design another garment, start a new team order.",
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

describe("Change garment in the designer's menu", () => {
  const editorLinks = leaveLinks({ countryCode: "pk", handle: "jersey", signedIn: true, orderId: "teamord_1", returnTo: "/design/jersey", garments: "editor" })

  it("opens the editor's own chooser where the editor offers one, and does not leave", () => {
    const onLeave = vi.fn()
    const onGarments = vi.fn(() => true)
    render(<DesignerMenu links={editorLinks} onLeave={onLeave} onGarments={onGarments} />)
    fireEvent.click(screen.getByRole("button", { name: "Store menu" }))
    expect(screen.queryByTestId("designer-menu-chooser-hint")).toBeNull()
    fireEvent.click(screen.getByTestId("designer-menu-chooser"))
    expect(onGarments).toHaveBeenCalled()
    expect(onLeave).not.toHaveBeenCalled()
  })

  it("leads to the chooser page when the editor's chooser cannot be opened", () => {
    const onLeave = vi.fn()
    render(<DesignerMenu links={editorLinks} onLeave={onLeave} onGarments={() => false} />)
    fireEvent.click(screen.getByRole("button", { name: "Store menu" }))
    fireEvent.click(screen.getByTestId("designer-menu-chooser"))
    expect(onLeave).toHaveBeenCalledWith("/pk/design")
  })

  it("in a team order without a chooser (one garment, or a locked list) it leads to the page and says how to design another garment", () => {
    const pageLinks = leaveLinks({ countryCode: "pk", handle: "t-shirt", signedIn: true, orderId: "teamord_1", returnTo: "/x" })
    expect(pageLinks.find((l) => l.id === "chooser")).toMatchObject({ href: "/pk/design", hint: "A team order is for one garment. To design another garment, start a new team order." })
    expect(pageLinks.find((l) => l.id === "chooser")!.action).toBeUndefined()
    // outside an order: a plain link, no sentence
    const free = leaveLinks({ countryCode: "pk", handle: "jersey", signedIn: false, orderId: null, returnTo: "/x" })
    expect(free.find((l) => l.id === "chooser")!.hint).toBeUndefined()
  })
})
