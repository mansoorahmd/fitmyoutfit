import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import Alert from "@modules/common/components/alert"
import DeliveryDateLine from "@modules/common/components/delivery-date-line"
import QuantityStepper from "@modules/common/components/quantity-stepper"
import Sheet from "@modules/common/components/sheet"

describe("Alert", () => {
  it("says its variant with an icon and words, not colour alone", () => {
    render(
      <Alert variant="error" title="Something failed">
        Details
      </Alert>
    )
    const alert = screen.getByTestId("alert")
    expect(alert.querySelector("[data-icon=alert]")).not.toBeNull()
    expect(alert).toHaveTextContent("Something failedDetails")
    expect(alert).toHaveClass("bg-brand-error-surface", "border-brand-error", "border-s-4")
    // part of the page on load: not announced
    expect(alert).not.toHaveAttribute("role")
  })

  it("is announced when it appears after an action: alert for errors, status for the rest", () => {
    const { rerender } = render(<Alert variant="error" announce title="x" />)
    expect(screen.getByTestId("alert")).toHaveAttribute("role", "alert")
    rerender(<Alert variant="success" announce title="x" />)
    expect(screen.getByTestId("alert")).toHaveAttribute("role", "status")
    expect(screen.getByTestId("alert").querySelector("[data-icon=check]")).not.toBeNull()
  })

  it("takes focus when it blocks the main action", () => {
    render(<Alert variant="error" announce focusOnMount title="x" />)
    expect(screen.getByTestId("alert")).toHaveFocus()
    expect(screen.getByTestId("alert")).toHaveAttribute("tabindex", "-1")
  })
})

describe("QuantityStepper", () => {
  const Harness = ({ max = 999 }: { max?: number }) => {
    const [value, setValue] = useState(1)
    return (
      <QuantityStepper
        value={value}
        onChange={setValue}
        max={max}
        label="Quantity, Jersey, size M"
        decreaseLabel="Decrease quantity"
        increaseLabel="Increase quantity"
        rangeMessage={`Enter a number from 1 to ${max}`}
      />
    )
  }

  it("has 44 px buttons that stay focusable when inactive", () => {
    render(<Harness max={2} />)
    const minus = screen.getByRole("button", { name: "Decrease quantity" })
    const plus = screen.getByRole("button", { name: "Increase quantity" })
    expect(minus).toHaveClass("h-11", "w-11")
    expect(minus).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(minus)
    expect(screen.getByRole("textbox")).toHaveValue("1")

    fireEvent.click(plus)
    expect(screen.getByRole("textbox")).toHaveValue("2")
    expect(plus).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(plus)
    expect(screen.getByRole("textbox")).toHaveValue("2")
  })

  it("takes typed numbers and ties the range message to the field", () => {
    render(<Harness />)
    const field = screen.getByRole("textbox", { name: "Quantity, Jersey, size M" })
    expect(field).toHaveAttribute("inputmode", "numeric")
    fireEvent.change(field, { target: { value: "25" } })
    fireEvent.blur(field)
    expect(field).toHaveValue("25")

    fireEvent.change(field, { target: { value: "0" } })
    fireEvent.blur(field)
    expect(field).toHaveValue("25")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription("Enter a number from 1 to 999")
  })
})

describe("DeliveryDateLine", () => {
  it("shows the backend's date as a calendar day with its note", () => {
    render(<DeliveryDateLine date="2026-11-26" />)
    expect(screen.getByTestId("delivery-date-line")).toHaveTextContent(
      "Delivered by Thursday 26 November"
    )
    expect(screen.getByTestId("delivery-date-line")).toHaveTextContent("Counted from today.")
  })

  it("is left out without a date, never guessed; a grey bar while loading", () => {
    const { container, rerender } = render(<DeliveryDateLine date={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<DeliveryDateLine date="not a date" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<DeliveryDateLine date={null} loading />)
    expect(screen.getByTestId("delivery-date-loading")).toHaveClass("w-[220px]", "h-5")
  })
})

describe("Sheet", () => {
  const Harness = ({ onClose }: { onClose: () => void }) => {
    const [open, setOpen] = useState(true)
    return (
      <Sheet
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="Size chart"
        closeLabel="Close size chart"
      >
        <p>Body</p>
      </Sheet>
    )
  }

  it("adds a history entry, and Back closes it", () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    expect(window.history.state?.sheet).toBeTruthy()

    act(() => {
      window.history.replaceState({ ...window.history.state, sheet: undefined }, "")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("has a 44 px close button with its own label", () => {
    render(<Harness onClose={() => {}} />)
    const close = screen.getByRole("button", { name: "Close size chart" })
    expect(close).toHaveClass("h-11", "w-11")
  })
})
