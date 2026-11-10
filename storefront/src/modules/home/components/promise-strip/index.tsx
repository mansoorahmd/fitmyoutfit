import { homeContent } from "@content/home"
import { forRegion } from "@lib/util/home-regions"
import LineIcon from "@modules/home/components/line-icon"

/**
 * The four facts a coach worries about, right under the hero
 * (docs/design/03-direction.md, "Home page" 2). Three are the same
 * everywhere; the fourth depends on the region. Two by two on phones, four
 * across from 768 px. The strip's heading is for screen readers only, so the
 * item titles sit under it as h3.
 */
const PromiseStrip = ({ countryCode }: { countryCode: string }) => {
  const items = forRegion(homeContent.promises, countryCode)

  return (
    <section
      aria-labelledby="promise-strip-heading"
      className="border-b border-brand-border bg-brand-surface-alt"
      data-testid="promise-strip"
    >
      <h2 id="promise-strip-heading" className="sr-only">
        {homeContent.promisesHeading}
      </h2>
      <ul className="content-container grid grid-cols-2 gap-x-4 gap-y-6 py-8 md:grid-cols-4 md:gap-x-6 md:py-10 xl:gap-x-8">
        {items.map((item) => (
          <li key={item.title} className="flex flex-col gap-2" data-testid="promise-item">
            <LineIcon name={item.icon} className="text-brand-ink" />
            <h3 className="font-sans text-[16px] font-bold leading-6 text-brand-ink">
              {item.title}
            </h3>
            <p className="type-small text-brand-ink-muted">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default PromiseStrip
