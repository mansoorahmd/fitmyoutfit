import { cartContent } from "@content/cart"
import { homeContent } from "@content/home"
import { ButtonLink } from "@modules/common/components/button"

/**
 * The empty cart (docs/design/05-m1-pages.md, 4.5): a left-aligned block
 * 48 px under the header with the home page's "Start your team kit" (full
 * width on a phone) and "See the fit kit". The garment cards follow it on
 * the page. "Browse garments" waits until the main button goes to the
 * editor: today both would go to /store.
 */
const EmptyCartMessage = () => (
  <div
    className="content-container flex flex-col items-start gap-4 pt-12"
    data-testid="empty-cart-message"
  >
    <h1 className="type-h1 text-brand-ink">{cartContent.empty.title}</h1>
    <p className="type-body text-brand-ink-muted">{cartContent.empty.text}</p>
    <div className="flex w-full flex-col items-start gap-2 md:w-auto md:flex-row md:items-center md:gap-6">
      <ButtonLink
        href={homeContent.button.href}
        fullWidth
        className="md:w-auto"
        data-testid="empty-cart-start"
      >
        {homeContent.button.label}
      </ButtonLink>
      <ButtonLink
        href={homeContent.sizing.button.href}
        variant="text"
        className="-ml-1 md:ml-0"
        data-testid="empty-cart-fit-kit"
      >
        {homeContent.sizing.button.label}
      </ButtonLink>
    </div>
  </div>
)

export default EmptyCartMessage
