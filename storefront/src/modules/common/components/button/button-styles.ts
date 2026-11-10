// Class names for the store's own button (docs/design/03-direction.md,
// "States for every component"). Plain logic, so the states can be unit
// tested without rendering. Only the primary variant uses the brand's red:
// red anywhere else is a defect.

export type ButtonVariant = "primary" | "secondary" | "text"

export type ButtonStyleOptions = {
  variant?: ButtonVariant
  /** Disabled or loading: shown as inactive and ignores presses. */
  inactive?: boolean
  fullWidth?: boolean
}

const BASE =
  "relative inline-flex items-center justify-center gap-2 select-none " +
  "transition-colors duration-150 ease-out " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"

// Filled and outlined buttons: 48 px tall, 4 px radius, condensed capitals at 18 px.
const BLOCK =
  "h-12 min-w-[44px] px-6 rounded-control border-2 " +
  "font-heading font-bold uppercase text-[18px] leading-none tracking-[0.04em]"

// Text links: body font, underlined, still a 44 px touch target.
const TEXT =
  "min-h-[44px] px-1 font-sans font-semibold text-[16px] leading-6 " +
  "underline underline-offset-4"

const VARIANTS: Record<ButtonVariant, { active: string; inactive: string }> = {
  primary: {
    active:
      "bg-brand-primary border-brand-primary text-brand-on-primary " +
      "hover:bg-brand-primary-hover hover:border-brand-primary-hover " +
      "active:bg-brand-primary-hover active:border-brand-primary-hover",
    // The fill (not the label) drops to 40%: the label is the reason the
    // button is inactive ("Select a size"), so it stays readable.
    inactive:
      "bg-brand-primary/40 border-transparent text-brand-ink cursor-not-allowed",
  },
  secondary: {
    active:
      "bg-transparent border-brand-ink text-brand-ink hover:bg-brand-surface-alt",
    inactive:
      "bg-transparent border-brand-ink/40 text-brand-ink-muted cursor-not-allowed",
  },
  text: {
    active: "text-brand-ink decoration-1 hover:decoration-2",
    inactive: "text-brand-ink-muted decoration-1 cursor-not-allowed",
  },
}

export const buttonClasses = ({
  variant = "primary",
  inactive = false,
  fullWidth = false,
}: ButtonStyleOptions = {}): string =>
  [
    BASE,
    variant === "text" ? TEXT : BLOCK,
    inactive ? VARIANTS[variant].inactive : VARIANTS[variant].active,
    fullWidth ? "w-full" : "",
  ]
    .filter(Boolean)
    .join(" ")
