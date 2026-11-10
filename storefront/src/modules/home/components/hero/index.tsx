import { clx } from "@medusajs/ui"
import Image from "next/image"

import { homeContent } from "@content/home"
import { ButtonLink } from "@modules/common/components/button"

/**
 * The home page hero on navy (docs/design/03-direction.md, "Home page" 1).
 * Phones: text first and a full-width button, short enough that the button
 * is on the first screen. From 1280 px, with an image: text 5/12 and image
 * 7/12. Without an image (today) it is a finished text-only band, never an
 * empty box. The "How team orders work" link is left out until that section
 * exists.
 */
const Hero = () => {
  const { headline, subline, button, heroImage } = homeContent

  return (
    <section
      className="bg-brand-inverse text-brand-on-inverse"
      aria-labelledby="home-hero-heading"
      data-testid="home-hero"
    >
      <div
        className={clx(
          "content-container py-8 md:py-16 xl:py-24",
          heroImage &&
            "xl:grid xl:min-h-[min(640px,80vh)] xl:grid-cols-12 xl:items-center xl:gap-8"
        )}
      >
        {/* Text only: wide enough at 1280 px for the headline to sit on one line */}
        <div
          className={heroImage ? "xl:col-span-5" : "max-w-[760px] xl:max-w-[1000px]"}
        >
          <h1 id="home-hero-heading" className="type-display">
            {headline}
          </h1>
          <p className="mt-4 max-w-[560px] type-body-lg text-brand-on-inverse-muted">
            {subline}
          </p>
          <ButtonLink
            href={button.href}
            fullWidth
            className="mt-6 md:mt-8 md:w-auto"
            data-testid="home-hero-button"
          >
            {button.label}
          </ButtonLink>
        </div>

        {heroImage && (
          <div
            className="relative mt-8 aspect-[4/3] overflow-hidden rounded-card xl:col-span-7 xl:mt-0"
            data-testid="home-hero-image"
          >
            <Image
              src={heroImage.src}
              alt={heroImage.alt}
              fill
              priority
              sizes="(min-width: 1280px) 700px, 100vw"
              className="object-cover"
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default Hero
