import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// next/image needs the Next runtime; a plain img keeps the alt text and the
// loading attributes this test cares about.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    priority,
    loading,
  }: {
    src: string
    alt: string
    priority?: boolean
    loading?: "eager" | "lazy"
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      data-priority={priority ? "true" : undefined}
      loading={loading}
    />
  ),
}))

import ImageGallery from "@modules/products/components/image-gallery"

const image = (n: number) => ({ id: `img_${n}`, url: `https://x.test/${n}.jpg` })
const three = [image(1), image(2), image(3)] as any

const position = () => screen.getByTestId("gallery-position").textContent

describe("image gallery", () => {
  it("shows the controls with their names when there are three images", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    expect(screen.getByRole("button", { name: "Previous image" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next image" })).toBeInTheDocument()
    for (const n of [1, 2, 3]) {
      expect(
        screen.getByRole("button", { name: `Show image ${n} of 3` })
      ).toBeInTheDocument()
    }
    // 2 arrows + 3 dots/thumbnails, nothing else.
    expect(screen.getAllByRole("button")).toHaveLength(5)
    expect(position()).toBe("Image 1 of 3")
  })

  it("gives every image alt text with its position", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    expect(screen.getByAltText("Jersey, image 1 of 3")).toBeInTheDocument()
    expect(screen.getByAltText("Jersey, image 2 of 3")).toBeInTheDocument()
    expect(screen.getByAltText("Jersey, image 3 of 3")).toBeInTheDocument()
  })

  it("is one focusable carousel region with a name", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    const region = screen.getByRole("region", { name: "Jersey images" })
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).toHaveAttribute("aria-roledescription", "carousel")
  })

  it("disables previous on the first image and next on the last", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)
    const previous = screen.getByRole("button", { name: "Previous image" })
    const next = screen.getByRole("button", { name: "Next image" })

    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(previous).toBeEnabled()
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(position()).toBe("Image 3 of 3")
    expect(next).toBeDisabled()
    expect(previous).toBeEnabled()
  })

  it("changes the announced position when next, previous, a thumbnail or a dot is used", () => {
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

  it("marks the current dot or thumbnail", () => {
    render(<ImageGallery images={three} productTitle="Jersey" />)

    expect(screen.getByRole("button", { name: "Show image 1 of 3" })).toHaveAttribute(
      "aria-current",
      "true"
    )
    fireEvent.click(screen.getByRole("button", { name: "Show image 2 of 3" }))
    expect(screen.getByRole("button", { name: "Show image 2 of 3" })).toHaveAttribute(
      "aria-current",
      "true"
    )
    expect(
      screen.getByRole("button", { name: "Show image 1 of 3" })
    ).not.toHaveAttribute("aria-current")
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

  it("loads the first image with priority and does not load the far ones early", () => {
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
    // The next image is fetched at once; the one after it waits.
    expect(screen.getByAltText("Jersey, image 2 of 4")).toHaveAttribute("loading", "eager")
    expect(screen.getByAltText("Jersey, image 4 of 4")).toHaveAttribute("loading", "lazy")
  })

  it("shows no arrows, dots or thumbnails for one image", () => {
    render(<ImageGallery images={[image(1)] as any} productTitle="Fit Kit" />)

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryByTestId("gallery-position")).toBeNull()
    expect(screen.getByAltText("Fit Kit")).toBeInTheDocument()
  })

  it("shows a placeholder in the same frame when there are no images", () => {
    render(<ImageGallery images={[]} productTitle="Jersey" />)

    const placeholder = screen.getByTestId("gallery-placeholder")
    expect(placeholder).toHaveClass("aspect-[29/34]")
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
  })
})
