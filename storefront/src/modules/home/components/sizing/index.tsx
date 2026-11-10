import { homeContent } from "@content/home"
import { ButtonLink } from "@modules/common/components/button"

/**
 * "Not sure of sizes?" (docs/design/03-direction.md, "Home page" 6): one
 * line on the refundable fit kit and a secondary button to it. The spec's
 * size-chart link waits for the size chart.
 */
const Sizing = () => {
  const { title, text, button } = homeContent.sizing

  return (
    <section
      className="content-container py-12 xl:py-24"
      aria-labelledby="sizing-heading"
      data-testid="sizing"
    >
      <div className="flex flex-col gap-4 rounded-card border border-brand-border-strong p-6 md:flex-row md:items-center md:justify-between md:gap-8 md:p-8">
        <div className="flex flex-col gap-2">
          <h2 id="sizing-heading" className="type-h2 text-brand-ink">
            {title}
          </h2>
          <p className="type-body-lg text-brand-ink-muted">{text}</p>
        </div>
        <ButtonLink
          href={button.href}
          variant="secondary"
          fullWidth
          className="md:w-auto md:shrink-0"
          data-testid="sizing-button"
        >
          {button.label}
        </ButtonLink>
      </div>
    </section>
  )
}

export default Sizing
