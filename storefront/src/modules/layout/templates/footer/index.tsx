import { footerContent, FooterLink } from "@content/footer"
import { navigationContent } from "@content/navigation"
import { listGarmentLinks } from "@lib/data/garment-links"
import { listRegions } from "@lib/data/regions"
import { STORE_NAME } from "@lib/store-config"
import { toRegionChoices } from "@lib/util/region-choices"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RegionSelector from "@modules/layout/components/region-selector"

const linkClasses =
  "inline-flex min-h-[44px] items-center rounded-control type-body text-brand-on-inverse underline-offset-4 decoration-2 transition-colors duration-150 ease-out hover:underline"

const LinkColumn = ({
  heading,
  links,
  testId,
}: {
  heading: string
  links: FooterLink[]
  testId: string
}) => (
  <div className="flex flex-col gap-2" data-testid={testId}>
    <h2 className="type-small font-semibold uppercase tracking-[0.06em] text-brand-on-inverse-muted">
      {heading}
    </h2>
    <ul className="flex flex-col">
      {links.map((link) => (
        <li key={link.href}>
          <LocalizedClientLink href={link.href} className={linkClasses}>
            {link.label}
          </LocalizedClientLink>
        </li>
      ))}
    </ul>
  </div>
)

/**
 * The footer on every page (docs/design/03-direction.md, "Footer"): navy,
 * plain links in columns (two on phones, the store name and three link
 * columns from 768 px), then the header's region selector and the
 * copyright. Only pages that exist are linked.
 */
export default async function Footer({ countryCode }: { countryCode: string }) {
  const [regions, garments] = await Promise.all([
    listRegions().catch(() => []),
    listGarmentLinks(countryCode),
  ])
  const regionChoices = toRegionChoices(regions)
  const { shop, teamOrders, account, regionLabel, rightsLine } = footerContent

  const shopLinks: FooterLink[] = [
    ...garments.map((garment) => ({ label: garment.title, href: garment.href })),
    ...shop.links,
  ]

  return (
    <footer
      className="bg-brand-inverse text-brand-on-inverse"
      data-testid="footer"
    >
      <div className="content-container flex flex-col gap-10 py-12 xl:py-16">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6 xl:gap-x-8">
          <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
            <LocalizedClientLink
              href="/"
              className="inline-flex min-h-[44px] items-center self-start rounded-control font-heading text-[28px] font-extrabold leading-none"
              data-testid="footer-store-link"
            >
              {STORE_NAME}
            </LocalizedClientLink>
            <p className="type-small text-brand-on-inverse-muted">
              {navigationContent.tagline}
            </p>
          </div>
          <LinkColumn heading={shop.heading} links={shopLinks} testId="footer-shop" />
          <LinkColumn
            heading={teamOrders.heading}
            links={teamOrders.links}
            testId="footer-team-orders"
          />
          <LinkColumn
            heading={account.heading}
            links={account.links}
            testId="footer-account"
          />
        </div>

        <div className="flex flex-col gap-6 border-t border-brand-on-inverse-muted/30 pt-6 md:flex-row md:items-center md:justify-between">
          {regionChoices.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="type-small text-brand-on-inverse-muted">{regionLabel}</span>
              <RegionSelector choices={regionChoices} currentCountryCode={countryCode} />
            </div>
          )}
          <p className="type-small text-brand-on-inverse-muted">
            © {new Date().getFullYear()} {STORE_NAME}. {rightsLine}
          </p>
        </div>
      </div>
    </footer>
  )
}
