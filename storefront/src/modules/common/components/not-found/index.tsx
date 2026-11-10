import Link from "next/link"

import { ButtonLink } from "@modules/common/components/button"
import { buttonClasses } from "@modules/common/components/button/button-styles"

export const NOT_FOUND_HEADING = "We can't find that page"

/**
 * The body of every not-found page (docs/design/03-direction.md, "Loading,
 * empty and failure"). Inside a region the links keep the country code;
 * the root not-found page has none, so it links to the bare paths and the
 * middleware picks the region.
 */
const NotFoundContent = ({ localized = true }: { localized?: boolean }) => {
  const garments = { href: "/store", label: "Browse garments" }
  const home = { href: "/", label: "Go to the home page" }

  return (
    <section
      className="content-container flex min-h-[60vh] flex-col items-start justify-center gap-6 py-12 md:py-24"
      data-testid="not-found"
    >
      <h1 className="type-h1 text-brand-ink">{NOT_FOUND_HEADING}</h1>
      <p className="type-body-lg max-w-xl text-brand-ink-muted">
        The link may be mistyped, or the page may have moved.
      </p>
      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
        {localized ? (
          <>
            <ButtonLink href={garments.href} fullWidth className="md:w-auto">
              {garments.label}
            </ButtonLink>
            <ButtonLink
              href={home.href}
              variant="secondary"
              fullWidth
              className="md:w-auto"
            >
              {home.label}
            </ButtonLink>
          </>
        ) : (
          <>
            <Link
              href={garments.href}
              className={`${buttonClasses({ fullWidth: true })} md:w-auto`}
            >
              {garments.label}
            </Link>
            <Link
              href={home.href}
              className={`${buttonClasses({
                variant: "secondary",
                fullWidth: true,
              })} md:w-auto`}
            >
              {home.label}
            </Link>
          </>
        )}
      </div>
    </section>
  )
}

export default NotFoundContent
