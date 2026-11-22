// The account's own line icons (docs/design/05-m1-pages.md, 9.1: each menu
// row has its icon), drawn like LineIcon (24 px box, 1.75 stroke, round
// ends, currentColor) so they sit beside it. Always decorative: the words
// next to an icon carry the meaning.

export type AccountIconName = "orders" | "team" | "pin" | "user" | "sign-out" | "chevron"

const PATHS: Record<AccountIconName, React.ReactNode> = {
  // an open box, as LineIcon's "package"
  orders: (
    <>
      <path d="M3.75 7.75L12 3.75l8.25 4v8.5L12 20.25l-8.25-4z" />
      <path d="M3.75 7.75L12 11.75l8.25-4M12 11.75v8.5" />
    </>
  ),
  // two heads and shoulders: a team
  team: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.25 19.75c.5-3.25 2.75-5.25 5.75-5.25s5.25 2 5.75 5.25" />
      <path d="M15.25 5.5a3.25 3.25 0 0 1 0 6M17 14.75c2 .5 3.25 2.25 3.75 5" />
    </>
  ),
  // a map pin
  pin: (
    <>
      <path d="M12 20.75s-6.25-5.5-6.25-10.5a6.25 6.25 0 0 1 12.5 0c0 5-6.25 10.5-6.25 10.5z" />
      <circle cx="12" cy="10.25" r="2.25" />
    </>
  ),
  // a head and shoulders
  user: (
    <>
      <circle cx="12" cy="8.25" r="3.75" />
      <path d="M4.75 20.25c.75-3.75 3.75-6 7.25-6s6.5 2.25 7.25 6" />
    </>
  ),
  // an arrow leaving a door
  "sign-out": (
    <>
      <path d="M13.25 4.75h-7.5v14.5h7.5" />
      <path d="M10.25 12h9.5M16.75 8.75L20 12l-3.25 3.25" />
    </>
  ),
  // a chevron pointing to the end of the line (mirror it for "back")
  chevron: <path d="M9.25 5.75L15.5 12l-6.25 6.25" />,
}

const AccountIcon = ({ name, className }: { name: AccountIconName; className?: string }) => (
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

export default AccountIcon
