"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

import { productContent } from "@content/product"
import GarmentOutline from "@modules/common/icons/garment-outline"
import {
  canGoNext,
  canGoPrevious,
  clampIndex,
  counterLabel,
  imageAlt,
  indexFromScroll,
  nextIndex,
  positionLabel,
  previousIndex,
  showImageLabel,
  slideLoading,
} from "./gallery-index"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  /** Used in the alt text of every image. */
  productTitle?: string
}

// One 4:5 frame on surface-alt for every state (loading, loaded, no image),
// reserved before the image arrives, so nothing on the page moves.
export const GALLERY_FRAME =
  "relative aspect-[4/5] w-full overflow-hidden rounded-card bg-brand-surface-alt"

// The photo is contained (sleeves never cropped) and multiplied onto the
// grey, as on the product card, so a photo shot on white blends in.
const PHOTO = "object-contain mix-blend-multiply"

// From 1024 px the main image is no taller than the viewport minus the
// header (64 px; 72 px from 1280) and 48 px, so its width is capped at 4/5
// of that height.
const MAIN_WIDTH =
  "w-full min-w-0 lg:flex-1 lg:max-w-[calc((100vh-112px)*0.8)] xl:max-w-[calc((100vh-120px)*0.8)]"

const SIZES = "(min-width: 1024px) 560px, (min-width: 768px) 560px, 100vw"

const ArrowIcon = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={direction === "left" ? "M12.5 4 6.5 10l6 6" : "M7.5 4l6 6-6 6"} />
  </svg>
)

// 44 px circles at the image's edges, light with a border so they show on
// any photo. Disabled (not hidden) at the ends. From 1024 px they sit at
// low emphasis and get stronger on hover and focus.
const ARROW =
  "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-brand-border-strong bg-brand-surface text-brand-ink " +
  "transition-opacity duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 " +
  "lg:opacity-60 lg:hover:opacity-100 lg:focus-visible:opacity-100 lg:disabled:opacity-25"

/**
 * The product gallery (docs/design/03-direction.md, "Product gallery
 * carousel"): a native scroll-snap track of 4:5 images.
 *
 * - Below 1024 px: inside the page gutters, a "2 / 5" counter top right,
 *   previous and next buttons at the edges, and a row of thumbnails under
 *   the image.
 * - From 1024 px: a column of thumbnails to the left of the main image.
 * - One image: the image only. No image: a garment outline and "Photo
 *   coming soon", in the same frame.
 *
 * The gallery is one tab stop (a labelled carousel region); the arrow keys
 * move between images, and reduced motion makes every move instant. The
 * first image loads with priority, the rest lazily (see slideLoading).
 * Tapping the image does nothing yet: the zoom viewer is a later task.
 */
const ImageGallery = ({
  images,
  productTitle = "Product",
}: ImageGalleryProps) => {
  const slides = images.filter((image) => !!image.url)
  const count = slides.length
  const { previous, next, noPhoto } = productContent.gallery

  const [state, setState] = useState(0)
  const current = clampIndex(state, count)
  // Set on the first touch, click, key or focus inside the gallery: from
  // then on the current image's neighbours load at once.
  const [engaged, setEngaged] = useState(false)

  const scrollerRef = useRef<HTMLDivElement>(null)
  // While a button or key press scrolls the container, the scroll handler
  // ignores the in-between positions so the announcement does not flicker.
  const targetRef = useRef<number | null>(null)
  const targetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  useEffect(() => () => clearTimeout(targetTimer.current), [])

  const goTo = useCallback(
    (index: number) => {
      const target = clampIndex(index, count)
      setState(target)

      const scroller = scrollerRef.current
      if (!scroller) {
        return
      }
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches

      targetRef.current = target
      clearTimeout(targetTimer.current)
      targetTimer.current = setTimeout(() => {
        targetRef.current = null
      }, 800)

      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({
          left: target * scroller.clientWidth,
          behavior: reduceMotion ? "auto" : "smooth",
        })
      }
    },
    [count]
  )

  // Keep the current index in step with swipes.
  const onScroll = () => {
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    const index = indexFromScroll(
      scroller.scrollLeft,
      scroller.clientWidth,
      count
    )
    if (targetRef.current !== null) {
      if (index !== targetRef.current) {
        return
      }
      targetRef.current = null
    }
    setState(index)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft" && canGoPrevious(current, count)) {
      event.preventDefault()
      goTo(previousIndex(current, count))
    } else if (event.key === "ArrowRight" && canGoNext(current, count)) {
      event.preventDefault()
      goTo(nextIndex(current, count))
    }
  }

  const engage = () => {
    if (!engaged) {
      setEngaged(true)
    }
  }

  if (count === 0) {
    return (
      <div className={`${MAIN_WIDTH} lg:mx-auto`}>
        <div
          className={`${GALLERY_FRAME} flex flex-col items-center justify-center gap-3`}
          data-testid="gallery-placeholder"
        >
          <GarmentOutline className="w-2/5 text-brand-border-strong" />
          <p className="type-small text-brand-ink-muted">{noPhoto}</p>
        </div>
      </div>
    )
  }

  if (count === 1) {
    return (
      <div className={`${MAIN_WIDTH} lg:mx-auto`}>
        <div className={GALLERY_FRAME} data-testid="gallery-single">
          <Image
            src={slides[0].url}
            priority
            className={PHOTO}
            alt={productTitle}
            fill
            sizes={SIZES}
            draggable={false}
          />
        </div>
      </div>
    )
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-card lg:flex-row-reverse lg:items-start lg:justify-center lg:gap-4"
      aria-roledescription="carousel"
      aria-label={`${productTitle} images`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={engage}
      onFocus={engage}
      data-testid="image-gallery"
    >
      <div className={`relative ${MAIN_WIDTH}`}>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          // The section is the one tab stop; stop Chrome adding a second
          // one for the scrolling container.
          tabIndex={-1}
          className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((image, index) => (
            <div
              key={image.id}
              role="group"
              aria-roledescription="slide"
              aria-label={positionLabel(index, count)}
              className={`${GALLERY_FRAME} shrink-0 snap-center snap-always`}
            >
              <Image
                src={image.url}
                priority={index === 0}
                loading={slideLoading(index, current, engaged)}
                className={PHOTO}
                alt={imageAlt(productTitle, index, count)}
                fill
                sizes={SIZES}
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* "2 / 5" for sighted users; the live region below announces it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 z-10 rounded-control bg-brand-inverse px-2 py-0.5 type-small font-semibold text-brand-on-inverse lg:hidden"
          data-testid="gallery-counter"
        >
          {counterLabel(current, count)}
        </span>

        <button
          type="button"
          aria-label={previous}
          disabled={!canGoPrevious(current, count)}
          onClick={() => goTo(previousIndex(current, count))}
          className={`${ARROW} left-2`}
        >
          <ArrowIcon direction="left" />
        </button>
        <button
          type="button"
          aria-label={next}
          disabled={!canGoNext(current, count)}
          onClick={() => goTo(nextIndex(current, count))}
          className={`${ARROW} right-2`}
        >
          <ArrowIcon direction="right" />
        </button>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="gallery-position">
        {positionLabel(current, count)}
      </p>

      {/*
        Thumbnails: a row under the image that scrolls sideways (a cut-off
        last one shows there are more), and from 1024 px a column to the
        left. The padding leaves room for the focus ring inside the
        scrolling box.
      */}
      <div
        className="-mx-1 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:-my-1 lg:max-h-[calc(100vh-112px)] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible xl:max-h-[calc(100vh-120px)]"
        data-testid="gallery-thumbnails"
      >
        {slides.map((image, index) => {
          const isCurrent = index === current
          return (
            <button
              key={image.id}
              type="button"
              aria-label={showImageLabel(index, count)}
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => goTo(index)}
              className={`relative h-[70px] w-14 shrink-0 overflow-hidden rounded-control border-2 bg-brand-surface-alt lg:h-[90px] lg:w-[72px] ${
                isCurrent ? "border-brand-ink" : "border-transparent hover:border-brand-border-strong"
              }`}
              data-testid="gallery-thumbnail"
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="(min-width: 1024px) 72px, 56px"
                className={PHOTO}
                draggable={false}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default ImageGallery
