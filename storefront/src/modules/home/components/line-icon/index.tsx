import type { HomeIconName } from "@content/home"

type LineIconName = HomeIconName | "check"

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
  check: <path d="M4.75 12.5l4.5 4.5 10-10" />,
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
