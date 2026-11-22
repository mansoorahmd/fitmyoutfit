import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { updateRegion, pathname } = vi.hoisted(() => ({
  updateRegion: vi.fn(async () => {}),
  pathname: { current: "/pk/products/jersey" },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  usePathname: () => pathname.current,
}))
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))
vi.mock("@lib/store-config", () => ({ STORE_NAME: "FitMyOutfit" }))
vi.mock("@lib/data/cart", () => ({ updateRegion }))
vi.mock("@lib/data/regions", () => ({
  listRegions: async () => [
    {
      id: "reg_pk",
      currency_code: "pkr",
      countries: [{ iso_2: "pk", display_name: "Pakistan" }],
    },
    {
      id: "reg_gb",
      currency_code: "gbp",
      countries: [{ iso_2: "gb", display_name: "United Kingdom" }],
    },
  ],
}))
// The garments come from the garments collection (mocked data layer), not
// from the component.
vi.mock("@lib/data/garment-links", () => ({
  listGarmentLinks: async () => [
    { id: "p1", title: "Test Jersey", href: "/products/jersey", thumbnail: "j.png" },
    { id: "p2", title: "Test Tee", href: "/products/t-shirt", thumbnail: "t.png" },
    { id: "p3", title: "Test Jacket", href: "/products/jacket", thumbnail: null },
  ],
}))
vi.mock("@modules/layout/components/cart-button", async () => {
  const { default: CartLink } = await import("@modules/layout/components/cart-link")
  return { default: () => <CartLink count={2} /> }
})

import Nav from "@modules/layout/templates/nav"

const renderNav = async () => render(await Nav({ countryCode: "pk" }))
const classesOf = (el: Element) => el.className.split(/\s+/)

describe("header", () => {
  beforeEach(() => {
    updateRegion.mockClear()
    pathname.current = "/pk/products/jersey"
  })

  it("is navy and sticky, 56 / 64 / 72 px tall", async () => {
    const { container } = await renderNav()

    expect(classesOf(container.firstElementChild!)).toEqual(
      expect.arrayContaining(["sticky", "top-0"])
    )
    expect(classesOf(container.querySelector("header")!)).toContain(
      "bg-brand-inverse"
    )
    const bar = screen.getByRole("navigation", { name: "Main" })
    expect(classesOf(bar)).toEqual(
      expect.arrayContaining(["h-14", "md:h-16", "xl:h-[72px]"])
    )
  })

  it("has the menu button first, then the wordmark linking home, tagline from 768 px", async () => {
    await renderNav()

    const menu = screen.getByRole("button", { name: "Menu" })
    const home = screen.getByTestId("nav-store-link")
    expect(
      menu.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(classesOf(menu)).toEqual(
      expect.arrayContaining(["h-11", "w-11", "xl:hidden"])
    )
    expect(home).toHaveAttribute("href", "/pk")
    expect(home).toHaveTextContent("FitMyOutfit")
    const tagline = screen.getByTestId("nav-tagline")
    expect(tagline).toHaveTextContent("Custom team kit")
    expect(classesOf(tagline)).toEqual(expect.arrayContaining(["hidden", "md:inline"]))
  })

  it("shows the region chip with country and currency", async () => {
    await renderNav()

    const chip = screen.getByTestId("region-chip")
    expect(chip).toHaveTextContent("PK · PKR")
    expect(chip).toHaveAccessibleName("PK · PKR, Pakistan. Change region")
    expect(classesOf(chip)).toContain("h-11")
  })

  it("shows the cart as a 44 px button with the count", async () => {
    await renderNav()

    const cart = screen.getByRole("link", { name: "Cart, 2 items" })
    expect(cart).toHaveAttribute("href", "/pk/cart")
    expect(screen.getByTestId("nav-cart-count")).toHaveTextContent("2")
    expect(classesOf(cart)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
  })

  it("from 1280 px: garment links from the collection and Account", async () => {
    await renderNav()

    const links = screen.getByTestId("nav-garment-links")
    expect(classesOf(links)).toEqual(expect.arrayContaining(["hidden", "xl:flex"]))
    expect(
      within(links).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])
    ).toEqual([
      ["Test Jersey", "/pk/products/jersey"],
      ["Test Tee", "/pk/products/t-shirt"],
      ["Test Jacket", "/pk/products/jacket"],
    ])
    const account = screen.getByTestId("nav-account-link")
    expect(account).toHaveAttribute("href", "/pk/account")
    expect(classesOf(account)).toEqual(
      expect.arrayContaining(["hidden", "xl:inline-flex"])
    )
  })

  it("from 1280 px: a plain 'Design your kit' link to the garment chooser, not red", async () => {
    await renderNav()

    const design = screen.getByTestId("nav-design-link")
    expect(design).toHaveTextContent("Design your kit")
    expect(design).toHaveAttribute("href", "/pk/design")
    expect(classesOf(design)).toEqual(expect.arrayContaining(["hidden", "xl:inline-flex"]))
    expect(design.className).not.toContain("brand-primary")
  })

  it("links nowhere that does not exist and uses no red", async () => {
    const { container } = await renderNav()

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    )
    for (const href of hrefs) {
      expect(href).toMatch(/^\/pk(\/(products\/[a-z-]+|account|cart|design))?$/)
    }
    expect(container.innerHTML).not.toContain("brand-primary")
  })
})

describe("menu drawer", () => {
  beforeEach(() => updateRegion.mockClear())

  const openMenu = async () => {
    await renderNav()
    fireEvent.click(screen.getByRole("button", { name: "Menu" }))
    return screen.findByRole("dialog")
  }

  it("opens from the left, 85% wide up to 360 px, white, with a 44 px close button", async () => {
    const dialog = await openMenu()

    const panel = screen.getByTestId("nav-menu-popup")
    expect(classesOf(panel)).toEqual(
      expect.arrayContaining(["left-0", "w-[85%]", "max-w-[360px]", "bg-brand-surface"])
    )
    const close = within(dialog).getByRole("button", { name: "Close menu" })
    expect(classesOf(close)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
  })

  it("has no full-screen blur", async () => {
    await openMenu()

    const backdrop = screen.getByTestId("side-menu-backdrop")
    expect(backdrop.className).not.toMatch(/blur/)
    expect(screen.getByTestId("nav-menu-popup").className).not.toMatch(/blur/)
  })

  it("lists the region selector first, then the garments with thumbnails, then Store, Account and Cart", async () => {
    const dialog = await openMenu()

    const text = dialog.textContent ?? ""
    const order = ["Region", "Pakistan", "Garments", "Test Jersey", "Store", "Account", "Cart"]
    const positions = order.map((word) => text.indexOf(word))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)

    const garments = within(dialog).getAllByTestId("menu-garment-link")
    expect(garments.map((g) => g.getAttribute("href"))).toEqual([
      "/pk/products/jersey",
      "/pk/products/t-shirt",
      "/pk/products/jacket",
    ])
    expect(garments[0].querySelector("img")).toHaveAttribute("src", "j.png")
    expect(within(dialog).queryByText(/Team orders|Help/)).not.toBeInTheDocument()
  })

  it("heads the menu with 'Design your kit' to the chooser, before the region list", async () => {
    const dialog = await openMenu()

    const link = within(dialog).getByTestId("menu-design-link")
    expect(link).toHaveAttribute("href", "/pk/design")
    expect(link).toHaveTextContent("Design your kit")
    const text = dialog.textContent ?? ""
    expect(text.indexOf("Design your kit")).toBeLessThan(text.indexOf("Region"))
  })

  it("closes on Esc", async () => {
    await openMenu()

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
      code: "Escape",
    })
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })

  it("closes with the close button", async () => {
    const dialog = await openMenu()

    fireEvent.click(within(dialog).getByRole("button", { name: "Close menu" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })

  it("marks the current region with a tick and the word Current", async () => {
    const dialog = await openMenu()

    const current = within(dialog)
      .getAllByTestId("region-option")
      .find((b) => b.getAttribute("aria-current") === "true")!
    expect(current).toHaveTextContent("Pakistan")
    expect(current).toHaveTextContent("Current")
  })

  it("choosing a region keeps the visitor on the same page", async () => {
    const dialog = await openMenu()

    const uk = within(dialog)
      .getAllByTestId("region-option")
      .find((b) => b.textContent?.includes("United Kingdom"))!
    await act(async () => {
      fireEvent.click(uk)
    })

    expect(updateRegion).toHaveBeenCalledWith("gb", "/products/jersey")
  })

  it("choosing the current region just closes the menu", async () => {
    const dialog = await openMenu()

    const pk = within(dialog)
      .getAllByTestId("region-option")
      .find((b) => b.textContent?.includes("Pakistan"))!
    fireEvent.click(pk)

    expect(updateRegion).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })
})

describe("region chip", () => {
  it("opens the region list in a dialog", async () => {
    await renderNav()

    fireEvent.click(screen.getByTestId("region-chip"))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Choose your region")).toBeInTheDocument()
    expect(within(dialog).getAllByTestId("region-option")).toHaveLength(2)
  })
})
