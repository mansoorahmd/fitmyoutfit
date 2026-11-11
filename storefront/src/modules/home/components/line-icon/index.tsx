import type { HomeIconName } from "@content/home"
import type { ProductFactIcon } from "@content/product"

export type LineIconName =
  | HomeIconName
  | ProductFactIcon
  | "check"
  | "alert"
  // M1 (docs/design/05-m1-pages.md, 10.1)
  | "ruler"
  | "team"
  | "trash"
  | "package"
  | "x"
  | "minus"
  | "plus"

// 24 px line icons drawn here (no icon library). Strokes use currentColor, so
// the icon takes the text colour of where it sits. Always decorative: the
// title next to the icon carries the meaning.
const PATHS: Record<LineIconName, React.ReactNode> = {
  // a lorry
  delivery: (
    <>
      <path d="M2.75 6.75h10.5v9.5H2.75z" />
      <path d="M13.25 9.75h4l3 3.25v3.25h-7" />
      <circle cx="6.5" cy="17.25" r="1.75" />
      <circle cx="16.75" cy="17.25" r="1.75" />
    </>
  ),
  // a pencil over a line
  "design-help": (
    <>
      <path d="M14.5 4.75l4.75 4.75L9 19.75H4.25V15z" />
      <path d="M12.5 6.75l4.75 4.75" />
    </>
  ),
  // two arrows in a circle
  replacement: (
    <>
      <path d="M19.25 12a7.25 7.25 0 0 1-12.6 4.9" />
      <path d="M4.75 12a7.25 7.25 0 0 1 12.6-4.9" />
      <path d="M17.75 3.75v3.6h-3.6" />
      <path d="M6.25 20.25v-3.6h3.6" />
    </>
  ),
  // a card
  payment: (
    <>
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="1.75" />
      <path d="M2.75 9.75h18.5" />
      <path d="M6.25 14.75h4" />
    </>
  ),
  // a closed box
  shipping: (
    <>
      <path d="M12 2.75l8.25 4.25v10L12 21.25 3.75 17V7z" />
      <path d="M3.75 7L12 11.25 20.25 7" />
      <path d="M12 11.25v10" />
    </>
  ),
  // a tape measure laid flat, for the fit kit
  "fit-kit": (
    <>
      <rect x="2.75" y="8.25" width="18.5" height="7.5" rx="1.25" />
      <path d="M6.75 8.25v3M10.25 8.25v2M13.75 8.25v3M17.25 8.25v2" />
    </>
  ),
  check: <path d="M4.75 12.5l4.5 4.5 10-10" />,
  // an exclamation mark in a circle, beside an error message
  alert: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75v5" />
      <path d="M12 16.25h.01" />
    </>
  ),
  // a ruler at an angle, before "Size chart"
  ruler: (
    <>
      <path d="M3.75 15.75L15.75 3.75l4.5 4.5-12 12z" />
      <path d="M7.25 12.25l2 2M10.25 9.25l1.5 1.5M13.25 6.25l2 2" />
    </>
  ),
  // two people, for the team minimum
  team: (
    <>
      <circle cx="9" cy="8.25" r="3" />
      <path d="M3.25 19.25c0-3.2 2.6-5.25 5.75-5.25s5.75 2.05 5.75 5.25" />
      <path d="M15.25 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17.25 14.25c2.1.5 3.5 2.2 3.5 5" />
    </>
  ),
  // a bin
  trash: (
    <>
      <path d="M4.75 6.75h14.5" />
      <path d="M9.25 6.75V4.75h5.5v2" />
      <path d="M6.75 6.75l.75 12.5h9l.75-12.5" />
      <path d="M10.25 10.25v5.5M13.75 10.25v5.5" />
    </>
  ),
  // an open box
  package: (
    <>
      <path d="M3.75 7.75L12 3.75l8.25 4v8.5L12 20.25l-8.25-4z" />
      <path d="M3.75 7.75L12 11.75l8.25-4M12 11.75v8.5" />
    </>
  ),
  x: <path d="M6.25 6.25l11.5 11.5M17.75 6.25L6.25 17.75" />,
  minus: <path d="M5.75 12h12.5" />,
  plus: <path d="M5.75 12h12.5M12 5.75v12.5" />,
}

const LineIcon = ({
  name,
  className,
}: {
  name: LineIconName
  className?: string
}) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={className}
    data-icon={name}
  >
    {PATHS[name]}
  </svg>
)

export default LineIcon
