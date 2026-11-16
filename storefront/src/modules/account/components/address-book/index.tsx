"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { accountContent } from "@content/account"
import { deleteCustomerAddress } from "@lib/data/customer"
import { authHref } from "@lib/util/account-auth"
import {
  AccountAddressValues,
  AddressCardView,
  initialAccountAddress,
  SavedAddress,
} from "@lib/util/account-address"
import { CountryChoice } from "@lib/util/checkout-address"
import { Button } from "@modules/common/components/button"
import Sheet from "@modules/common/components/sheet"

import AddressCard from "../address-card"
import AddressForm, { AddressFormOutcome } from "../address-form"
import StatusToast from "../status-toast"

const words = accountContent.addresses

type Mode =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; id: string }
  | { kind: "remove"; id: string }

/**
 * The address book (docs/design/05-m1-pages.md, 9.5): the cards (one
 * column at 360 px, two from 768 px), "Add an address" (secondary, full
 * width on phones), the form in a Sheet (a full-height bottom sheet on
 * phones, a 560 px dialog from 768 px; Back closes it), and "Remove this
 * address?" before removing. The empty state says why to add one.
 */
const AddressBook = ({
  cards,
  saved,
  countries,
  countryCode,
}: {
  cards: AddressCardView[]
  saved: SavedAddress[]
  countries: CountryChoice[]
  countryCode: string
}) => {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>({ kind: "closed" })
  const [removing, setRemoving] = useState(false)
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null)
  const removingRef = useRef(false)

  const hasDefault = saved.some((a) => !!a.is_default_shipping)
  const formOpen = mode.kind === "add" || mode.kind === "edit"
  const editing = mode.kind === "edit" ? saved.find((a) => a.id === mode.id) ?? null : null
  const [formKey, setFormKey] = useState(0)

  const initial: AccountAddressValues = initialAccountAddress({
    saved: editing,
    countryCode: countries.some((c) => c.code === countryCode) ? countryCode : countries[0]?.code ?? countryCode,
    hasDefault,
  })

  const open = (next: Mode) => {
    setFormKey((k) => k + 1)
    setMode(next)
  }

  /** Closes the sheet the way its own close button does: the entry it added to the history goes too. */
  const closeSheet = () => {
    if (typeof window !== "undefined" && window.history.state?.sheet) {
      window.history.back()
      return
    }
    setMode({ kind: "closed" })
  }

  const signedOut = () =>
    router.push(`/${countryCode}${authHref("signin", { next: "/account/addresses" })}`)

  const afterForm = (outcome: AddressFormOutcome) => {
    if (outcome === "signed_out") {
      signedOut()
      return
    }
    closeSheet()
  }

  const remove = async (id: string) => {
    if (removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    let ok = false
    try {
      const result = await deleteCustomerAddress(id)
      if (result.kind === "signed_out") {
        signedOut()
        return
      }
      ok = result.kind === "saved"
    } catch {
      ok = false
    } finally {
      removingRef.current = false
      setRemoving(false)
    }
    closeSheet()
    if (!ok) setToast({ key: Date.now(), message: words.removeFailed })
  }

  const removeCard = mode.kind === "remove" ? cards.find((c) => c.id === mode.id) : undefined

  return (
    <div className="flex flex-col gap-6" data-testid="address-book">
      {cards.length === 0 ? (
        <p className="type-body text-brand-ink" data-testid="addresses-empty">
          {words.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="address-list">
          {cards.map((card) => (
            <li key={card.id}>
              <AddressCard
                view={card}
                onEdit={() => open({ kind: "edit", id: card.id })}
                onRemove={() => setMode({ kind: "remove", id: card.id })}
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="secondary"
        fullWidth
        className="md:w-auto md:self-start"
        onClick={() => open({ kind: "add" })}
        data-testid="address-add"
      >
        {words.add}
      </Button>

      <Sheet
        open={formOpen}
        onClose={() => setMode({ kind: "closed" })}
        title={mode.kind === "edit" ? words.editTitle : words.add}
        closeLabel={words.close}
        data-testid="address-sheet"
      >
        {formOpen && (
          <AddressForm
            key={formKey}
            addressId={editing?.id}
            initial={initial}
            countries={countries}
            onDone={afterForm}
            onCancel={closeSheet}
          />
        )}
      </Sheet>

      <Sheet
        open={mode.kind === "remove"}
        onClose={() => setMode({ kind: "closed" })}
        title={words.removeTitle}
        subtitle={removeCard ? <bdi>{removeCard.firstLine}</bdi> : undefined}
        closeLabel={words.close}
        data-testid="address-remove-dialog"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Button
            variant="secondary"
            fullWidth
            className="md:w-auto"
            isLoading={removing}
            loadingText={words.removing}
            onClick={() => mode.kind === "remove" && remove(mode.id)}
            data-testid="address-remove-confirm"
          >
            {words.removeConfirm}
          </Button>
          <Button variant="text" className="self-center md:self-auto" onClick={closeSheet} data-testid="address-remove-keep">
            {words.keep}
          </Button>
        </div>
      </Sheet>

      {toast && (
        <StatusToast
          message={toast.message}
          variant="error"
          messageKey={toast.key}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

export default AddressBook
