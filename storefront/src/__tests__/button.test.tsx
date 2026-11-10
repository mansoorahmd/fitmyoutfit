import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
}))

import { Button, ButtonLink } from "@modules/common/components/button"
import { buttonClasses } from "@modules/common/components/button/button-styles"

const classesOf = (el: HTMLElement) => el.className.split(/\s+/)

describe("button styles", () => {
  it("is 48 px tall with condensed capital labels for filled and outlined variants", () => {
    for (const variant of ["primary", "secondary"] as const) {
      const classes = buttonClasses({ variant }).split(" ")
      expect(classes).toContain("h-12")
      expect(classes).toContain("font-heading")
      expect(classes).toContain("uppercase")
      expect(classes).toContain("text-[18px]")
      expect(classes).toContain("rounded-control")
    }
  })

  it("text variant is an underlined link that is still a 44 px target", () => {
    const classes = buttonClasses({ variant: "text" }).split(" ")
    expect(classes).toContain("underline")
    expect(classes).toContain("min-h-[44px]")
    expect(classes).toContain("hover:decoration-2")
  })

  it("uses the brand red only in the primary variant", () => {
    expect(buttonClasses({ variant: "primary" })).toMatch(/bg-brand-primary\b/)
    expect(buttonClasses({ variant: "primary" })).toContain(
      "hover:bg-brand-primary-hover"
    )
    for (const variant of ["secondary", "text"] as const) {
      for (const inactive of [false, true]) {
        expect(buttonClasses({ variant, inactive })).not.toContain("primary")
      }
    }
  })

  it("has a visible focus ring in every variant", () => {
    for (const variant of ["primary", "secondary", "text"] as const) {
      expect(buttonClasses({ variant })).toContain(
        "focus-visible:outline-brand-focus"
      )
      expect(buttonClasses({ variant })).toContain(
        "focus-visible:outline-offset-2"
      )
    }
  })

  it("inactive primary keeps a filled shape and a readable label", () => {
    const classes = buttonClasses({ variant: "primary", inactive: true }).split(
      " "
    )
    expect(classes).toContain("bg-brand-primary/40")
    expect(classes).toContain("text-brand-ink")
    expect(classes).toContain("h-12")
    expect(classes).not.toContain("opacity-40")
  })

  it("secondary hover fills with surface-alt", () => {
    expect(buttonClasses({ variant: "secondary" })).toContain(
      "hover:bg-brand-surface-alt"
    )
  })
})

describe("Button", () => {
  it("is a type=button that calls onClick", () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Add to cart</Button>)

    const button = screen.getByRole("button", { name: "Add to cart" })
    expect(button).toHaveAttribute("type", "button")
    expect(button).not.toHaveAttribute("aria-disabled")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("disabled: aria-disabled, still focusable, ignores presses", () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Select a size
      </Button>
    )

    const button = screen.getByRole("button", { name: "Select a size" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).not.toBeDisabled()
    button.focus()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("loading: spinner and loading label, busy, ignores presses", () => {
    const onClick = vi.fn()
    render(
      <Button isLoading loadingText="Adding…" onClick={onClick}>
        Add to cart
      </Button>
    )

    const button = screen.getByRole("button", { name: "Adding…" })
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("button-loading").querySelector("svg")).not.toBeNull()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("keeps the label and the loading label in one grid cell so the width does not change", () => {
    render(<Button loadingText="Adding…">Add to cart</Button>)

    const loading = screen.getByTestId("button-loading")
    expect(classesOf(loading)).toContain("invisible")
    expect(loading).toHaveAttribute("aria-hidden", "true")
    expect(classesOf(loading)).toContain("row-start-1")
    expect(
      classesOf(screen.getByText("Add to cart").closest("span") as HTMLElement)
    ).toContain("row-start-1")
  })

  it("a submit button does not submit while loading", () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    render(
      <form onSubmit={onSubmit as any}>
        <Button type="submit" isLoading>
          Sign in
        </Button>
      </form>
    )
    fireEvent.click(screen.getByRole("button"))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("ButtonLink", () => {
  it("is a localized link styled as a button", () => {
    render(<ButtonLink href="/store">Start your team kit</ButtonLink>)

    const link = screen.getByRole("link", { name: "Start your team kit" })
    expect(link).toHaveAttribute("href", "/pk/store")
    expect(classesOf(link)).toContain("bg-brand-primary")
    expect(classesOf(link)).toContain("h-12")
  })

  it("keeps every style class after merging with a caller's className", () => {
    render(
      <ButtonLink href="/store" fullWidth className="xl:w-auto">
        Go
      </ButtonLink>
    )
    const classes = classesOf(screen.getByRole("link"))
    for (const c of [
      "text-[18px]",
      "text-brand-on-primary",
      "font-heading",
      "font-bold",
      "border-2",
      "border-brand-primary",
      "w-full",
      "xl:w-auto",
    ]) {
      expect(classes).toContain(c)
    }
  })
})
