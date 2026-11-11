import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { chartFixture } from "./fixtures/m1"

const { backend, nav } = vi.hoisted(() => ({
  backend: {
    calls: [] as unknown[],
    answer: (() => Promise.resolve({ ok: true, added: null })) as () => Promise<unknown>,
  },
  nav: { pathname: "/gb/products/jersey", countryCode: "gb" },
}))

vi.mock("@lib/data/cart", () => ({
  addToCartAndConfirm: (args: unknown) => {
    backend.calls.push(args)
    return backend.answer()
  },
}))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: nav.countryCode }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {} }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
// The minimum line's switch is on in development only; turn it on here.
vi.mock("@content/product", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@content/product")>()
  return {
    ...actual,
    productContent: {
      ...actual.productContent,
      minimum: { ...actual.productContent.minimum, show: true },
    },
  }
})

import { AddedToCartProvider } from "@modules/cart/components/added-to-cart/context"
import CartPanel from "@modules/layout/components/cart-panel"
import ProductActions from "@modules/products/components/product-actions"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")

const gbRegion = { id: "reg_gb", currency_code: "gbp", metadata: { tax_final: false, min_garment_quantity: 10 } } as any

const jersey = (metadata: Record<string, unknown> = {}) =>
  ({
    id: "prod_jersey",
    handle: "jersey",
    title: "Jersey",
    metadata: { kind: "garment", ...metadata },
    options: [
      { id: "opt_size", title: "Size", values: ["S", "M", "L"].map((value) => ({ id: value, value })) },
    ],
    variants: ["S", "M", "L"].map((size) => ({
      id: `var_${size}`,
      manage_inventory: false,
      options: [{ option_id: "opt_size", value: size }],
      calculated_price: {
        calculated_amount: 22,
        original_amount: 22,
        currency_code: "gbp",
        calculated_price: { price_list_type: null },
      },
    })),
  }) as any

const addedView = (over: Record<string, unknown> = {}) => ({
  key: "k1",
  title: "Jersey",
  size: "M",
  quantity: 4,
  amount: "GBP 88.00",
  thumbnail: null,
  productHandle: "jersey",
  pieces: 5,
  total: "GBP 110.00",
  minimum: { required: 10, counted: 5, missing: 5, reached: false, fraction: 0.5 },
  counted: 5,
  ...over,
})

const setWidth = (wide: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes("1024"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as any
}

const renderPage = (product = jersey(), initialCounted: number | null = null) =>
  render(
    <AddedToCartProvider>
      <header>
        <CartPanel count={1} />
      </header>
      <ProductActions product={product} region={gbRegion} initialCounted={initialCounted} />
    </AddedToCartProvider>
  )

const addM = async () => {
  fireEvent.click(screen.getByRole("radio", { name: "M" }))
  await act(async () => {
    fireEvent.click(screen.getByTestId("add-product-button"))
  })
}

beforeEach(() => {
  backend.calls = []
  backend.answer = () => Promise.resolve({ ok: true, added: addedView() })
  setWidth(false)
})

describe("Added to your cart, below 1024 px", () => {
  it("shows inline under the main button, announced, with the line, the cart and the minimum", async () => {
    renderPage()
    await addM()

    const box = screen.getByTestId("added-inline")
    expect(within(box).getByText("Added to your cart").closest("[role=status]")).not.toBeNull()
    expect(within(box).getByTestId("added-line")).toHaveTextContent("JerseyGBP 88.00Size: M · × 4")
    expect(plain(within(box).getByTestId("added-summary").textContent)).toBe(
      "5 pieces in your cart · GBP 110.00"
    )
    expect(within(box).getByTestId("minimum-progress")).toHaveTextContent("5 of 10 garment pieces")
    expect(within(box).getByTestId("added-view-cart")).toHaveAttribute("href", "/gb/cart")
    // no checkout button in the confirmation
    expect(within(box).queryByText(/checkout/i)).toBeNull()
    expect(screen.queryByTestId("added-popover")).toBeNull()
  })

  it("Keep shopping closes it", async () => {
    renderPage()
    await addM()
    fireEvent.click(screen.getByTestId("added-keep-shopping"))
    expect(screen.queryByTestId("added-inline")).toBeNull()
  })

  it("an add from the sticky bar shows the snackbar too", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("radio", { name: "M" }))
    await act(async () => {
      fireEvent.click(screen.getByTestId("mobile-cart-button"))
    })
    const snackbar = screen.getByTestId("added-snackbar")
    expect(snackbar).toHaveTextContent("Added: Jersey, M × 4")
    expect(within(snackbar).getByRole("link", { name: "View cart" })).toHaveAttribute("href", "/gb/cart")
    fireEvent.click(within(snackbar).getByRole("button", { name: "Close" }))
    expect(screen.queryByTestId("added-snackbar")).toBeNull()
  })

  it("after a failed add, shows the error under the button, focused, and no confirmation", async () => {
    backend.answer = () => Promise.resolve({ ok: false })
    renderPage()
    await addM()

    const error = screen.getByTestId("add-error")
    expect(error).toHaveAttribute("role", "alert")
    expect(error).toHaveTextContent("We couldn't add this to your cart. Try again.")
    expect(error).toHaveFocus()
    expect(screen.queryByTestId("added-inline")).toBeNull()
  })
})

describe("Added to your cart, from 1024 px", () => {
  it("is a popover under the header's cart icon, with a close button", async () => {
    setWidth(true)
    renderPage()
    await addM()

    const popover = screen.getByTestId("added-popover")
    expect(popover.closest("header")).not.toBeNull()
    expect(screen.queryByTestId("added-inline")).toBeNull()
    // not modal: focus stays where it was
    expect(popover).not.toContainElement(document.activeElement as HTMLElement)
    fireEvent.click(within(popover).getByRole("button", { name: "Close" }))
    expect(screen.queryByTestId("added-popover")).toBeNull()
  })

  it("closes on Esc and on a click outside, and has no timer", async () => {
    vi.useFakeTimers()
    setWidth(true)
    renderPage()
    await addM()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByTestId("added-popover")).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByTestId("added-popover")).toBeNull()
    vi.useRealTimers()

    await addM()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId("added-popover")).toBeNull()
  })
})

describe("the minimum line on the product page (export regions)", () => {
  it("shows the region's minimum under the price, and the count in the cart once there is one", async () => {
    renderPage(jersey(), 4)
    const line = screen.getByTestId("minimum-line")
    expect(line).toHaveTextContent("Minimum order: 10 garment pieces. Mix sizes and garments.")
    expect(line).toHaveTextContent("You have 4 in your cart.")

    await addM()
    expect(screen.getByTestId("minimum-in-cart")).toHaveTextContent("You have 5 in your cart.")
  })

  it("shows no count without garments in the cart", () => {
    renderPage(jersey(), null)
    expect(screen.queryByTestId("minimum-in-cart")).toBeNull()
  })

  it("is not shown in Pakistan", () => {
    nav.countryCode = "pk"
    try {
      renderPage()
      expect(screen.queryByTestId("minimum-line")).toBeNull()
    } finally {
      nav.countryCode = "gb"
    }
  })
})

describe("size chart on the product page", () => {
  it("has no link and no sheet without a chart", () => {
    renderPage()
    expect(screen.queryByTestId("size-chart-link")).toBeNull()
  })

  it("opens a sheet from the link at the end of the size row, with the draft note and the table", async () => {
    const pushState = vi.spyOn(window.history, "pushState")
    renderPage(jersey({ size_chart: chartFixture() }))
    fireEvent.click(screen.getByRole("radio", { name: "M" }))

    const link = screen.getByTestId("size-chart-link")
    expect(link).toHaveTextContent("Size chart")
    fireEvent.click(link)

    const sheet = screen.getByTestId("size-chart-sheet")
    const title = within(sheet).getByRole("heading", { name: "Size chart" })
    await waitFor(() => expect(title).toHaveFocus())
    expect(sheet).toHaveTextContent("Jersey")
    expect(within(sheet).getByTestId("size-chart-draft")).toHaveTextContent("Draft measurements")
    expect(sheet).toHaveTextContent("Measured on the garment laid flat.")
    // Back closes it: opening adds a history entry
    expect(pushState).toHaveBeenCalled()

    const table = within(sheet).getByTestId("size-chart-table")
    expect(within(table).getByRole("columnheader", { name: "Chest width (cm)" })).toBeInTheDocument()
    const chosen = table.querySelector('[data-chosen="true"]')!
    expect(chosen).toHaveTextContent("MYour choice")
    expect(within(sheet).getByTestId("size-chart-fit-kit")).toHaveAttribute("href", "/gb/products/fit-kit")
    pushState.mockRestore()
  })

  it("switches to inches", () => {
    renderPage(jersey({ size_chart: chartFixture() }))
    fireEvent.click(screen.getByTestId("size-chart-link"))
    const sheet = screen.getByTestId("size-chart-sheet")
    fireEvent.click(within(sheet).getByRole("radio", { name: "in" }))
    expect(within(sheet).getByRole("columnheader", { name: "Chest width (in)" })).toBeInTheDocument()
    // YS chest 38 cm = 15.0 in
    expect(within(sheet).getAllByTestId("size-chart-row")[0]).toHaveTextContent("YS15.020.5")
  })

  it("shows the fit kit's chart inline as 'Sizes in the kit', with no link to itself", () => {
    const fitKit = {
      ...jersey({ kind: "fit_kit", size_chart: chartFixture({ draft: false }) }),
      handle: "fit-kit",
      title: "Fit kit",
      options: [{ id: "opt", title: "Kit", values: [{ id: "d", value: "Default" }] }],
      variants: [{ id: "var_kit", manage_inventory: false, options: [{ option_id: "opt", value: "Default" }] }],
    }
    renderPage(fitKit)
    const section = screen.getByTestId("fit-kit-sizes")
    expect(within(section).getByRole("heading", { name: "Sizes in the kit" })).toBeInTheDocument()
    expect(within(section).queryByTestId("size-chart-draft")).toBeNull()
    expect(within(section).queryByTestId("size-chart-fit-kit")).toBeNull()
    expect(screen.queryByTestId("minimum-line")).toBeNull()
  })
})
