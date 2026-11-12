import { clx } from "@medusajs/ui"

import { accountContent } from "@content/account"
import { AddressCardView } from "@lib/util/account-address"
import { fill } from "@lib/util/wording"
import LineIcon from "@modules/home/components/line-icon"

const words = accountContent.addresses

const TEXT_BUTTON =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2 focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"

/**
 * A saved address (docs/design/05-m1-pages.md, 9.5, `AddressCard`): a
 * 1 px `border-strong` box, the card radius, 16 px padding; the name
 * (semibold, isolated), the address lines (each `dir="auto"`), the phone
 * (left to right), "Default" with the check icon, and "Edit" and "Remove"
 * as 44 px text buttons named with the first address line ("Edit address,
 * 12 Mall Road"). Without `onEdit` and `onRemove` it shows no buttons (the
 * overview).
 */
const AddressCard = ({
  view,
  onEdit,
  onRemove,
  className,
}: {
  view: AddressCardView
  onEdit?: () => void
  onRemove?: () => void
  className?: string
}) => (
  <div
    className={clx("flex h-full flex-col gap-3 rounded-card border border-brand-border-strong p-4", className)}
    data-testid="address-card"
    data-default={view.isDefault ? "true" : undefined}
  >
    <div className="flex min-w-0 flex-col gap-0.5 type-body text-brand-ink wrap-anywhere">
      {view.name && (
        <p className="font-semibold" data-testid="address-card-name">
          <bdi>{view.name}</bdi>
        </p>
      )}
      {view.lines.map((line, i) => (
        <p key={i} dir="auto" className="text-start">
          {line}
        </p>
      ))}
      {view.phone && (
        <p dir="ltr" className="text-start">
          {view.phone}
        </p>
      )}
    </div>
    {view.isDefault && (
      <p className="flex items-center gap-1.5 type-small font-semibold text-brand-ink" data-testid="address-card-default">
        <LineIcon name="check" className="h-5 w-5 shrink-0" />
        <span>{words.default}</span>
      </p>
    )}
    {(onEdit || onRemove) && (
      <div className="mt-auto flex flex-wrap gap-x-4">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={fill(words.editLabel, { line: view.firstLine })}
            className={TEXT_BUTTON}
            data-testid="address-edit"
          >
            {words.edit}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={fill(words.removeLabel, { line: view.firstLine })}
            className={TEXT_BUTTON}
            data-testid="address-remove"
          >
            {words.remove}
          </button>
        )}
      </div>
    )}
  </div>
)

export default AddressCard
