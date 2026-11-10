import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// next/image needs the Next runtime; a plain img keeps the alt text, the
// classes and the loading attributes this test cares about.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    priority,
    loading,
    className,
  }: {
    src: string
    alt: string
    priority?: boolean
    loading?: "eager" | "lazy"
    className?: string
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      data-priority={priority ? "true" : undefined}
      loading={loading}
    />
  ),
}))

import ImageGallery from "@modules/products/components/image-gallery"

const image = (n: number) => ({ id: `img_${n}`, url: `https://x.test/${n}.jpg` })
const three = [image(1), image(2), image(3)] as any

const position = () => screen.getByTestId("gallery-position").textContent
const counter = () => screen.getByTestId("gallery-counter").textContent

describe("image gallery", () => {
  it("shows the arrows and one thumbnail per image, nothing else", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    expect(screen.getByRole("button", { name: "Previous image" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next image" })).toBeInTheDocument()
    const thumbnails = within(screen.getByTestId("gallery-thumbnails")).getAllByRole(
      "button"
    )
    expect(thumbnails.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Show image 1 of 3",
      "Show image 2 of 3",
      "Show image 3 of 3",
    ])
    // 2 arrows + 3 thumbnails; no dots
    expect(screen.getAllByRole("button")).toHaveLength(5)
    expect(position()).toBe("Image 1 of 3")
  })

  it("sizes the thumbnails 56 x 70 on phones and 72 x 90 from 1024 px, 8 px apart", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    const row = screen.getByTestId("gallery-thumbnails")
    expect(row).toHaveClass("gap-2", "overflow-x-auto", "lg:flex-col")
    for (const thumb of screen.getAllByTestId("gallery-thumbnail")) {
      expect(thumb).toHaveClass("w-14", "h-[70px]", "lg:w-[72px]", "lg:h-[90px]")
    }
  })

  it("shows a '1 / 3' counter that follows the current image", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    expect(counter()).toBe("1 / 3")
    fireEvent.click(screen.getByRole("button", { name: "Next image" }))
    expect(counter()).toBe("2 / 3")
    fireEvent.click(screen.getByRole("button", { name: "Show image 3 of 3" }))
    expect(counter()).toBe("3 / 3")
  })

  it("gives every image alt text with its position, and labels every slide", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    for (const n of [1, 2, 3]) {
      expect(screen.getByAltText(`Jersey, image ${n} of 3`)).toBeInTheDocument()
      expect(screen.getByRole("group", { name: `Image ${n} of 3` })).toHaveAttribute(
        "aria-roledescription",
        "slide"
      )
    }
  })

  it("shows every photo whole on surface-alt in a 4:5 frame", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    for (const slide of screen.getAllByRole("group")) {
      expect(slide).toHaveClass("aspect-[4/5]", "bg-brand-surface-alt")
    }
    expect(screen.getByAltText("Jersey, image 1 of 3")).toHaveClass("object-contain")
  })

  it("is one focusable carousel region with a name", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    const region = screen.getByRole("region", { name: "Jersey images" })
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).toHaveAttribute("aria-roledescription", "carousel")
  })

  it("disables (does not hide) previous on the first image and next on the last", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)
    const previous = screen.getByRole("button", { name: "Previous image" })
    const next = screen.getByRole("button", { name: "Next image" })

    expect(previous).toBeDisabled()
    expect(previous).toBeVisible()
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(previous).toBeEnabled()
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(position()).toBe("Image 3 of 3")
    expect(next).toBeDisabled()
    expect(next).toBeVisible()
    expect(previous).toBeEnabled()
  })

  it("changes the announced position when next, previous or a thumbnail is used", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    fireEvent.click(screen.getByRole("button", { name: "Next image" }))
    expect(position()).toBe("Image 2 of 3")

    fireEvent.click(screen.getByRole("button", { name: "Show image 3 of 3" }))
    expect(position()).toBe("Image 3 of 3")

    fireEvent.click(screen.getByRole("button", { name: "Previous image" }))
    expect(position()).toBe("Image 2 of 3")

    fireEvent.click(screen.getByRole("button", { name: "Show image 1 of 3" }))
    expect(position()).toBe("Image 1 of 3")
  })

  it("marks the current thumbnail with aria-current and an ink outline", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    const first = screen.getByRole("button", { name: "Show image 1 of 3" })
    const second = screen.getByRole("button", { name: "Show image 2 of 3" })
    expect(first).toHaveAttribute("aria-current", "true")
    expect(first).toHaveClass("border-2", "border-brand-ink")

    fireEvent.click(second)
    expect(second).toHaveAttribute("aria-current", "true")
    expect(second).toHaveClass("border-brand-ink")
    expect(first).not.toHaveAttribute("aria-current")
    expect(first).not.toHaveClass("border-brand-ink")
  })

  it("moves with the left and right arrow keys, and stops at the ends", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)
    const region = screen.getByRole("region", { name: "Jersey images" })

    fireEvent.keyDown(region, { key: "ArrowLeft" })
    expect(position()).toBe("Image 1 of 3")

    fireEvent.keyDown(region, { key: "ArrowRight" })
    fireEvent.keyDown(region, { key: "ArrowRight" })
    expect(position()).toBe("Image 3 of 3")

    fireEvent.keyDown(region, { key: "ArrowRight" })
    expect(position()).toBe("Image 3 of 3")

    fireEvent.keyDown(region, { key: "ArrowLeft" })
    expect(position()).toBe("Image 2 of 3")
  })

  it("loads the first image with priority and the rest lazily", () => {
    render(
      <ImageGallery
        images={[image(1), image(2), image(3), image(4)] as any}
        productTitle="Jersey"
      />
    )

    expect(screen.getByAltText("Jersey, image 1 of 4")).toHaveAttribute(
      "data-priority",
      "true"
    )
    for (const n of [2, 3, 4]) {
      const img = screen.getByAltText(`Jersey, image ${n} of 4`)
      expect(img).toHaveAttribute("loading", "lazy")
      expect(img).not.toHaveAttribute("data-priority")
    }
  })

  it("fetches the next image at once when the visitor starts using the gallery", () => {
    render(
      <ImageGallery
        images={[image(1), image(2), image(3), image(4)] as any}
        productTitle="Jersey"
      />
    )

    fireEvent.focus(screen.getByRole("region", { name: "Jersey images" }))
    expect(screen.getByAltText("Jersey, image 2 of 4")).toHaveAttribute("loading", "eager")
    expect(screen.getByAltText("Jersey, image 4 of 4")).toHaveAttribute("loading", "lazy")
  })

  it("shows no arrows, counter or thumbnails for one image", () => {
    render(<ImageGallery images={[image(1)] as any} productTitle="Fit Kit" />)

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryByTestId("gallery-position")).toBeNull()
    expect(screen.queryByTestId("gallery-counter")).toBeNull()
    expect(screen.queryByTestId("gallery-thumbnails")).toBeNull()
    const img = screen.getByAltText("Fit Kit")
    expect(img).toHaveAttribute("data-priority", "true")
    expect(screen.getByTestId("gallery-single")).toHaveClass("aspect-[4/5]")
  })

  it("shows the garment outline and 'Photo coming soon' in the same frame when there are no images", () => {
    render(<ImageGallery images={[]} productTitle="Jersey" />)

    const placeholder = screen.getByTestId("gallery-placeholder")
    expect(placeholder).toHaveClass("aspect-[4/5]", "bg-brand-surface-alt")
    expect(within(placeholder).getByText("Photo coming soon")).toBeInTheDocument()
    expect(placeholder.querySelector("svg")).not.toBeNull()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryAllByRole("img")).toHaveLength(0)
  })

  it("ignores images without a url", () => {
    render(
      <ImageGallery
        images={[image(1), { id: "img_bad", url: "" }, image(2)] as any}
        productTitle="Jersey"
      />
    )

    expect(position()).toBe("Image 1 of 2")
    expect(counter()).toBe("1 / 2")
  })
})
