import { homeContent } from "@content/home"
import { ButtonLink } from "@modules/common/components/button"

/**
 * "How team orders work" (docs/design/03-direction.md, "Home page" 4): four
 * numbered steps on navy, the payment line, then the main button. A list on
 * phones, two columns from 768 px, four from 1280 px. The step numbers use
 * the accent, which is for navy backgrounds only. The hero's text link and
 * the footer jump here by the section's id; scroll-margin keeps the heading
 * clear of the sticky header.
 */
const HowItWorks = () => {
  const { id, title, steps, paymentLine, button } = homeContent.howItWorks

  return (
    <section
      id={id}
      className="scroll-mt-14 bg-brand-inverse text-brand-on-inverse md:scroll-mt-16 xl:scroll-mt-[72px]"
      aria-labelledby={`${id}-heading`}
      data-testid="how-it-works"
    >
      <div className="content-container flex flex-col gap-8 py-12 xl:gap-12 xl:py-24">
        <h2 id={`${id}-heading`} className="type-h2">
          {title}
        </h2>
        {/* role="list": Safari drops list semantics (and so the numbering) when list-style is none */}
        <ol role="list" className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step}
              className="flex gap-4 border-t border-brand-on-inverse-muted/40 pt-4 xl:flex-col xl:gap-3"
              data-testid="how-it-works-step"
            >
              <span
                aria-hidden="true"
                className="w-12 shrink-0 font-heading text-[40px] font-extrabold leading-none text-brand-accent xl:w-auto"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="type-body-lg">{step}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="type-body text-brand-on-inverse-muted" data-testid="how-it-works-payment">
            {paymentLine}
          </p>
          <ButtonLink
            href={button.href}
            fullWidth
            className="md:w-auto md:shrink-0"
            data-testid="how-it-works-button"
          >
            {button.label}
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
