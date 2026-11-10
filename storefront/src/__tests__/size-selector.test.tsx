import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import OptionSelect from "@modules/products/components/product-actions/option-select"

// The jersey's size option, in the order the preview backend returns it
const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]
const sizeOption = {
  id: "opt_size",
  title: "Size",
  values: SIZES.map((value) => ({ id: `v_${value}`, value })),
} as any

const Controlled = ({
  unavailable,
  onChange = () => {},
}: {
  unavailable?: string[]
  onChange?: (id: string, v: string) => void
}) => {
  const [current, setCurrent] = useState<string | undefined>()
  return (
    <OptionSelect
      option={sizeOption}
      title="Size"
      current={current}
      disabled={false}
      unavailable={unavailable}
      updateOption={(id, v) => {
        onChange(id, v)
        setCurrent(v)
      }}
    />
  )
}

const chipOf = (radio: HTMLElement) =>
  radio.nextElementSibling as HTMLElement

describe("size selector", () => {
  it("is one radio group named Size with every size as a radio", () => {
    render(<Controlled />)

    const group = screen.getByRole("radiogroup", { name: "Size" })
    expect(within(group).getAllByRole("radio")).toHaveLength(11)
  })

  it("shows two labelled groups, Youth then Adult, in size order", () => {
    render(<Controlled />)

    const youth = screen.getByText("Youth")
    const adult = screen.getByText("Adult")
    expect(
      youth.compareDocumentPosition(adult) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    const describedBy = (value: string) =>
      screen.getByRole("radio", { name: value }).getAttribute("aria-describedby")
    for (const v of ["YS", "YM", "YL", "YXL"]) {
      expect(describedBy(v)).toBe(youth.id)
    }
    for (const v of ["XS", "S", "M", "L", "XL", "2XL", "3XL"]) {
      expect(describedBy(v)).toBe(adult.id)
    }

    const order = screen
      .getAllByRole("radio")
      .map((r) => (r as HTMLInputElement).value)
    expect(order).toEqual(SIZES)
  })

  it("lays chips out 4 to a row on phones, 48 px tall", () => {
    render(<Controlled />)

    const row = screen.getByRole("radio", { name: "M" }).closest("label")!
      .parentElement!
    expect(row.className).toContain("grid-cols-4")
    expect(row.className).toContain("gap-2")
    expect(row.className).toContain("md:flex")
    // from 1024 px the seven adult sizes share one row in the buy column
    expect(row.className).toContain("lg:grid-cols-7")
    expect(chipOf(screen.getByRole("radio", { name: "M" })).className).toContain(
      "h-12"
    )
  })

  it("selecting a size checks it, fills its chip and updates the label row", () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    expect(screen.getByText("Size")).toBeInTheDocument()
    const medium = screen.getByRole("radio", { name: "M" })
    fireEvent.click(medium)

    expect(onChange).toHaveBeenCalledWith("opt_size", "M")
    expect(medium).toBeChecked()
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
    expect(screen.getByText("Size: M")).toBeInTheDocument()
    // filled when checked: ink fill and white label
    const chip = chipOf(medium).className
    expect(chip).toContain("peer-checked:bg-brand-ink")
    expect(chip).toContain("peer-checked:text-brand-on-inverse")
    expect(chip).toContain("peer-focus-visible:outline-brand-focus")
  })

  it("marks an unavailable size in its name and with a dashed, struck-through chip", () => {
    render(<Controlled unavailable={["3XL"]} />)

    const radio = screen.getByRole("radio", { name: "3XL, unavailable" })
    expect(chipOf(radio).className).toContain("border-dashed")
    expect(chipOf(radio).querySelector("svg line")).not.toBeNull()
    expect(screen.getByRole("radio", { name: "M" })).toBeInTheDocument()
  })

  it("does not group an option that is not a size", () => {
    render(
      <OptionSelect
        option={
          {
            id: "opt_colour",
            title: "Colour",
            values: [{ id: "c1", value: "Navy" }],
          } as any
        }
        title="Colour"
        current={undefined}
        disabled={false}
        updateOption={() => {}}
      />
    )
    expect(screen.queryByText("Youth")).not.toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Navy" })).not.toHaveAttribute(
      "aria-describedby"
    )
  })
})
