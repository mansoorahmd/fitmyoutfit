import { ButtonLink } from "@modules/common/components/button"

/** A plain full-screen message with a way back: no 3D in this browser, or the designer did not load. */
export default function DesignMessage({
  title,
  text,
  backHref,
  backLabel,
  action,
}: {
  title: string
  text: string
  /** A path without the country code: the product page. */
  backHref: string
  backLabel: string
  /** An extra button, such as "Try again". */
  action?: { label: string; onClick: () => void }
}) {
  return (
    <section
      role="alert"
      className="content-container flex min-h-[100dvh] flex-col items-start justify-center gap-6 py-12"
      data-testid="design-message"
    >
      <h1 className="type-h1 text-brand-ink">{title}</h1>
      <p className="type-body-lg max-w-xl text-brand-ink-muted">{text}</p>
      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex h-12 items-center justify-center rounded-control border-2 border-brand-primary bg-brand-primary px-6 font-heading text-[18px] font-bold uppercase leading-none tracking-[0.04em] text-brand-on-primary"
          >
            {action.label}
          </button>
        )}
        <ButtonLink href={backHref} variant="secondary" fullWidth className="md:w-auto">
          {backLabel}
        </ButtonLink>
      </div>
    </section>
  )
}
