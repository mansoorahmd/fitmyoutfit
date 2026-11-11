import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@lib/data/cart", () => ({ addToCart: async () => {} }))
vi.mock("next/navigation", () => ({ useParams: () => ({ countryCode: "gb" }) }))

import {
  UndoToastProvider,
  useAnnounceRemoved,
  useReportBottomBar,
} from "@modules/cart/components/undo-toast/provider"

/** Stands in for the cart page: a sticky bar that can show, and a removal. */
const Page = () => {
  const [bar, setBar] = useState(true)
  const [mounted, setMounted] = useState(true)
  const announce = useAnnounceRemoved()
  return (
    <>
      {mounted && <Bar shown={bar} />}
      <button onClick={() => announce({ title: "Jersey", size: "M", quantity: 4, variantId: "var_M" })}>
        remove
      </button>
      <button onClick={() => setBar(false)}>hide bar</button>
      <button onClick={() => setMounted(false)}>empty cart</button>
    </>
  )
}
const Bar = ({ shown }: { shown: boolean }) => {
  useReportBottomBar(shown)
  return null
}

describe("the undo toast's place", () => {
  it("sits above the sticky checkout bar while it shows, and at the foot once it hides", () => {
    render(
      <UndoToastProvider>
        <Page />
      </UndoToastProvider>
    )
    fireEvent.click(screen.getByText("remove"))
    const toast = screen.getByTestId("undo-toast")
    expect(toast).toHaveAttribute("data-placement", "above-bar")
    expect(toast).toHaveClass("bottom-[calc(72px+env(safe-area-inset-bottom))]")

    act(() => {
      fireEvent.click(screen.getByText("hide bar"))
    })
    expect(screen.getByTestId("undo-toast")).toHaveAttribute("data-placement", "bottom")
  })

  it("goes to the foot when the last line is removed and the bar goes with the cart", () => {
    render(
      <UndoToastProvider>
        <Page />
      </UndoToastProvider>
    )
    fireEvent.click(screen.getByText("remove"))
    expect(screen.getByTestId("undo-toast")).toHaveAttribute("data-placement", "above-bar")
    act(() => {
      fireEvent.click(screen.getByText("empty cart"))
    })
    expect(screen.getByTestId("undo-toast")).toHaveAttribute("data-placement", "bottom")
  })
})
