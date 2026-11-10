import { Suspense } from "react"

import { navigationContent } from "@content/navigation"
import { listGarmentLinks } from "@lib/data/garment-links"
import { listRegions } from "@lib/data/regions"
import { STORE_NAME } from "@lib/store-config"
import { toRegionChoices } from "@lib/util/region-choices"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import CartLink from "@modules/layout/components/cart-link"
import RegionSelector from "@modules/layout/components/region-selector"
import SideMenu from "@modules/layout/components/side-menu"

const navLink =
  "inline-flex min-h-[44px] items-center rounded-control px-3 type-small font-semibold text-brand-on-inverse underline-offset-8 decoration-2 transition-colors duration-150 ease-out hover:underline"

/**
 * The header on every page (docs/design/03-direction.md, "Header"): navy and
 * sticky; 56 px tall on phones, 64 px from 768 px, 72 px from 1280 px.
 * Left: the menu button (below 1280 px) and the wordmark, with the tagline
 * from 768 px. Right: the region chip and the cart. From 1280 px the garment
 * links and Account replace the menu button.
 *
 * The spec's compact "Start your team kit" button is left out: on the home
 * page it would be a second red button beside the hero's, and on the product
 * page it would compete with "Add to cart". Red is for the main button only.
 */
export default async function Nav({ countryCode }: { countryCode: string }) {
  const [regions, garments] = await Promise.all([
    listRegions().catch(() => []),
    listGarmentLinks(countryCode),
  ])
  const regionChoices = toRegionChoices(regions)

  return (
    <div className="sticky top-0 inset-x-0 z-50">
      <header className="bg-brand-inverse text-brand-on-inverse">
        <nav
          aria-label="Main"
          className="content-container flex h-14 items-center gap-x-1 md:h-16 xl:h-[72px] xl:gap-x-2"
        >
          <SideMenu
            regions={regionChoices}
            currentCountryCode={countryCode}
            garments={garments}
          />

          <LocalizedClientLink
            href="/"
            className="flex min-h-[44px] min-w-0 items-center gap-3 rounded-control pr-2"
            data-testid="nav-store-link"
          >
            <span className="font-heading text-[26px] font-extrabold leading-none tracking-[0.01em] md:text-[28px]">
              {STORE_NAME}
            </span>
            <span
              className="hidden border-l border-brand-on-inverse-muted/50 pl-3 type-small text-brand-on-inverse-muted md:inline"
              data-testid="nav-tagline"
            >
              {navigationContent.tagline}
            </span>
          </LocalizedClientLink>

          {garments.length > 0 && (
            <ul
              className="ml-6 hidden items-center gap-x-1 xl:flex"
              data-testid="nav-garment-links"
            >
              {garments.map((garment) => (
                <li key={garment.id}>
                  <LocalizedClientLink href={garment.href} className={navLink}>
                    {garment.title}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-x-2">
            <RegionSelector
              choices={regionChoices}
              currentCountryCode={countryCode}
            />
            <LocalizedClientLink
              href={navigationContent.accountLink.href}
              className={`${navLink} hidden xl:inline-flex`}
              data-testid="nav-account-link"
            >
              {navigationContent.accountLink.label}
            </LocalizedClientLink>
            <Suspense fallback={<CartLink count={0} />}>
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
