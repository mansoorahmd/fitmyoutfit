import { clx } from "@medusajs/ui"
import Image from "next/image"

import { homeContent } from "@content/home"
import { ButtonLink } from "@modules/common/components/button"
import { heroOverlayClasses, heroTextMaxWidthClass } from "./overlay"

/**
 * The home page hero on navy (docs/design/03-direction.md, "Home page" 1, as
 * sharpened by 04-reference-spized.md): a full-width kit image behind the
 * headline, under a navy layer strong enough for 4.5:1 text (see ./overlay),
 * the main button, a secondary button to the garments and a text link to
 * "How team orders work". Without an image it is a finished navy band.
 *
 * Phones: text first, buttons full width, short enough that the main button
 * is on the first screen.
 */
const Hero = () => {
  const { headline, subline, button, secondaryButton, howItWorksLink, heroImage } =
    homeContent

  return (
    <section
      className="relative isolate overflow-hidden bg-brand-inverse text-brand-on-inverse"
      aria-labelledby="home-hero-heading"
      data-testid="home-hero"
    >
      {heroImage && (
        <div className="absolute inset-0 -z-10" data-testid="home-hero-image">
          <Image
            src={heroImage.src}
            alt={heroImage.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[70%_center]"
          />
          <div
            aria-hidden="true"
            className={heroOverlayClasses}
            data-testid="home-hero-overlay"
          />
        </div>
      )}

      <div
        className={clx(
          "content-container py-10 md:py-16 xl:py-24",
          heroImage && "md:py-24 xl:flex xl:min-h-[min(640px,80vh)] xl:items-center"
        )}
      >
        {/* Text only: wide enough at 1280 px for the headline to sit on one line */}
        <div
          className={
            heroImage
              ? clx("max-w-[640px]", heroTextMaxWidthClass)
              : "max-w-[760px] xl:max-w-[1000px]"
          }
        >
          <h1 id="home-hero-heading" className="type-display">
            {headline}
          </h1>
          <p
            className={clx(
              "mt-4 max-w-[560px] type-body-lg",
              // Over a photo the subline is white, for the most contrast.
              heroImage ? "text-brand-on-inverse" : "text-brand-on-inverse-muted"
            )}
          >
            {subline}
          </p>
          <div className="mt-6 flex flex-col gap-3 md:mt-8 md:flex-row md:flex-wrap md:items-center">
            <ButtonLink
              href={button.href}
              fullWidth
              className="md:w-auto"
              data-testid="home-hero-button"
            >
              {button.label}
            </ButtonLink>
            <ButtonLink
              href={secondaryButton.href}
              variant="secondary-inverse"
              fullWidth
              className="md:w-auto"
              data-testid="home-hero-secondary-button"
            >
              {secondaryButton.label}
            </ButtonLink>
          </div>
          <ButtonLink
            href={howItWorksLink.href}
            variant="text-inverse"
            className="mt-3 -ml-1 md:mt-4"
            data-testid="home-hero-how-link"
          >
            {howItWorksLink.label}
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

export default Hero
