import { checkoutContent } from "@content/checkout"
import { STORE_NAME } from "@lib/store-config"
import { fill } from "@lib/util/wording"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"

/**
 * The checkout's frame (docs/design/05-m1-pages.md, 6.2): a 56 px navy
 * header with the wordmark (home) on the left and "Back to cart" on the
 * right ("Cart" on narrow phones), and nothing else to wander off to; no
 * full footer, one small line.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const { header } = checkoutContent

  return (
    <div className="flex min-h-screen w-full flex-col bg-brand-bg">
      <header className="sticky top-0 z-50 bg-brand-inverse text-brand-on-inverse print:static">
        <nav aria-label={checkoutContent.pageTitle} className="content-container flex h-14 items-center justify-between gap-4">
          <LocalizedClientLink
            href="/"
            className="flex min-h-[44px] min-w-0 items-center rounded-control font-heading text-[26px] font-extrabold leading-none tracking-[0.01em]"
            data-testid="store-link"
          >
            {STORE_NAME}
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/cart"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-control px-1 type-body font-semibold text-brand-on-inverse underline-offset-4 hover:underline print:hidden"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90" size={20} aria-hidden="true" />
            <span className="hidden min-[375px]:inline">{header.backToCart}</span>
            <span className="min-[375px]:hidden">{header.backToCartShort}</span>
          </LocalizedClientLink>
        </nav>
      </header>
      <div className="relative flex-1" data-testid="checkout-container">
        {children}
      </div>
      <footer className="border-t border-brand-border print:hidden">
        <p className="content-container py-4 type-small text-brand-ink-muted">
          {fill(header.copyright, { store: STORE_NAME })}
        </p>
      </footer>
    </div>
  )
}
