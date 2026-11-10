import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/pk/store",
  useSearchParams: () => new URLSearchParams("page=1"),
  useRouter: () => ({ push }),
}))

import RefinementList from "@modules/store/components/refinement-list"

describe("store sorting", () => {
  it("changes the sort order without scrolling the page", () => {
    render(<RefinementList sortBy="created_at" />)

    fireEvent.click(screen.getByLabelText(/Low -> High/))

    expect(push).toHaveBeenCalledWith(
      "/pk/store?page=1&sortBy=price_asc",
      { scroll: false }
    )
  })
})
