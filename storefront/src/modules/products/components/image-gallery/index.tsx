"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  canGoNext,
  canGoPrevious,
  clampIndex,
  imageAlt,
  indexFromScroll,
  nextIndex,
  positionLabel,
  previousIndex,
  showImageLabel,
} from "./gallery-index"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  /** Used in the alt text of every image. */
  productTitle?: string
}

// One frame shape for every state (loading, loaded, no images), so the page
// never moves.
const FRAME =
  "relative aspect-[29/34] w-full overflow-hidden rounded-rounded bg-ui-bg-subtle"

const SIZES = "(max-width: 1024px) 100vw, 600px"

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive"

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

// A light circle with a border and a dark icon, so it shows on light and
// dark images alike. Arrows are for desktop; phones swipe.
const ARROW =
  "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ui-border-strong bg-white text-ui-fg-base small:flex disabled:cursor-not-allowed disabled:opacity-40"

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start relative">{children}</div>
)

const ImageGallery = ({
  images,
  productTitle = "Product",
}: ImageGalleryProps) => {
  const slides = images.filter((image) => !!image.url)
  const count = slides.length

  const [state, setState] = useState(0)
  const current = clampIndex(state, count)

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
      const next = clampIndex(index, count)
      setState(next)

      const scroller = scrollerRef.current
      if (!scroller) {
        return
      }
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches

      targetRef.current = next
      clearTimeout(targetTimer.current)
      targetTimer.current = setTimeout(() => {
        targetRef.current = null
      }, 800)

      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({
          left: next * scroller.clientWidth,
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

  if (count === 0) {
    return (
      <Wrapper>
        <div className="flex flex-col flex-1 small:mx-16">
          <div
            className={`${FRAME} flex items-center justify-center`}
            data-testid="gallery-placeholder"
          >
            <span className="text-small-regular text-ui-fg-muted">
              No image available
            </span>
          </div>
        </div>
      </Wrapper>
    )
  }

  if (count === 1) {
    return (
      <Wrapper>
        <div className="flex flex-col flex-1 small:mx-16">
          <div className={FRAME}>
            <Image
              src={slides[0].url}
              priority
              className="absolute inset-0 object-cover"
              alt={productTitle}
              fill
              sizes={SIZES}
            />
          </div>
        </div>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      <section
        className={`flex flex-col flex-1 small:mx-16 gap-y-2 rounded-rounded ${FOCUS}`}
        aria-roledescription="carousel"
        aria-label={`${productTitle} images`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-testid="image-gallery"
      >
        <div className="relative">
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            // The section is the one tab stop; stop Chrome adding a second
            // one for the scrolling container.
            tabIndex={-1}
            className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-rounded [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {slides.map((image, index) => (
              <div
                key={image.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`Image ${index + 1} of ${count}`}
                className={`${FRAME} shrink-0 snap-center snap-always`}
              >
                <Image
                  src={image.url}
                  priority={index === 0}
                  // The neighbours of the current image load at once, so the
                  // next swipe never shows an empty frame.
                  loading={
                    index === 0
                      ? undefined
                      : Math.abs(index - current) <= 1
                        ? "eager"
                        : "lazy"
                  }
                  className="absolute inset-0 object-cover"
                  alt={imageAlt(productTitle, index, count)}
                  fill
                  sizes={SIZES}
                  draggable={false}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            aria-label="Previous image"
            disabled={!canGoPrevious(current, count)}
            onClick={() => goTo(previousIndex(current, count))}
            className={`${ARROW} left-2 ${FOCUS}`}
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            disabled={!canGoNext(current, count)}
            onClick={() => goTo(nextIndex(current, count))}
            className={`${ARROW} right-2 ${FOCUS}`}
          >
            <ArrowIcon direction="right" />
          </button>
        </div>

        <p
          className="sr-only"
          aria-live="polite"
          data-testid="gallery-position"
        >
          {positionLabel(current, count)}
        </p>

        {/*
          One set of buttons, shown two ways: a small dot on phones and a
          thumbnail from the `small` breakpoint up. On phones each button is
          44 px square around the dot.
        */}
        <div className="flex flex-wrap justify-center small:justify-start small:gap-2">
          {slides.map((image, index) => {
            const isCurrent = index === current
            return (
              <button
                key={image.id}
                type="button"
                aria-label={showImageLabel(index, count)}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => goTo(index)}
                className={`flex h-11 w-11 items-center justify-center small:relative small:block small:h-auto small:w-20 small:aspect-[29/34] small:overflow-hidden small:rounded-rounded small:border-2 small:bg-ui-bg-subtle ${
                  isCurrent
                    ? "small:border-ui-fg-base"
                    : "small:border-transparent"
                } ${FOCUS}`}
              >
                <span
                  aria-hidden="true"
                  className={`block h-2.5 w-2.5 rounded-full small:hidden ${
                    isCurrent ? "bg-ui-fg-base" : "bg-ui-border-strong"
                  }`}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 hidden small:block"
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    draggable={false}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </Wrapper>
  )
}

export default ImageGallery
