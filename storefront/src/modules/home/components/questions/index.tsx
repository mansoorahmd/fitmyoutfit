import { homeContent } from "@content/home"
import { forRegion } from "@lib/util/home-regions"
import ChevronDown from "@modules/common/icons/chevron-down"

/**
 * Questions (docs/design/03-direction.md, "Home page" 9) as native
 * `<details>`: they open without JavaScript, by keyboard and by find-in-page.
 * The shipping and duties question is for export regions only.
 */
const Questions = ({ countryCode }: { countryCode: string }) => {
  const { title, items } = homeContent.questions
  const shown = forRegion(items, countryCode)

  return (
    <section
      className="content-container pb-12 xl:pb-24"
      aria-labelledby="questions-heading"
      data-testid="questions"
    >
      <div className="flex flex-col gap-6 md:gap-8 xl:grid xl:grid-cols-12 xl:gap-8">
        <h2 id="questions-heading" className="type-h2 text-brand-ink xl:col-span-4">
          {title}
        </h2>
        <div className="border-t border-brand-border xl:col-span-8">
          {shown.map((item) => (
            <details
              key={item.question}
              className="group border-b border-brand-border"
              data-testid="question"
            >
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 type-body font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown
                  size={20}
                  aria-hidden="true"
                  className="shrink-0 transition-transform duration-150 ease-out group-open:rotate-180"
                />
              </summary>
              <p className="pb-4 pr-10 type-body text-brand-ink-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Questions
