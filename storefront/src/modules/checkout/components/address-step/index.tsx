"use client"

import { clx } from "@medusajs/ui"
import React, { useEffect, useRef, useState } from "react"

import { checkoutContent } from "@content/checkout"
import { errorContent } from "@content/errors"
import { SaveAddressResult, saveAddressStep } from "@lib/data/checkout"
import {
  AddressErrors,
  AddressFieldKey,
  AddressFields,
  AddressFormValues,
  FIELD_MAX,
  countryFieldRules,
  validateAddressForm,
  withNewAddress,
  withSavedAddress,
} from "@lib/util/checkout-address"
import { CheckoutView } from "@lib/util/checkout-view"
import Alert from "@modules/common/components/alert"
import { Button, ButtonLink } from "@modules/common/components/button"
import CheckField from "@modules/common/components/check-field"
import RadioCard from "@modules/common/components/radio-card"
import { SelectField, TextField } from "@modules/common/components/text-field"

import { addressDraft, keepAddressDraft, takeStepFocus } from "../../step-memory"
import AddressSummary from "../address-summary"

const words = checkoutContent.address
const NEW = "new"

export const fieldId = (key: AddressFieldKey) => `checkout-${key.replace(".", "-")}`

/** The fields of the form in the order they appear, for focus and the error list. */
const FIELD_ORDER: AddressFieldKey[] = [
  "email",
  "phone",
  ...(["shipping", "billing"] as const).flatMap((group) =>
    (
      [
        "first_name",
        "last_name",
        "company",
        "country_code",
        "address_1",
        "address_2",
        "city",
        "province",
        "postal_code",
      ] as const
    ).map((name) => `${group}.${name}` as AddressFieldKey)
  ),
]

type Problem = Exclude<SaveAddressResult, { kind: "saved" } | { kind: "invalid" }>["kind"]

/**
 * Step 1, contact and address (docs/design/05-m1-pages.md, 6.4). Open: the
 * saved addresses for a signed-in customer, then the fields; closed after
 * it is done: a summary with "Change". Its values stay here while the
 * customer moves between the steps, so Back from step 2 shows what was
 * typed. A field is checked when it loses focus after an edit; every field
 * on "Continue", with focus on the first error.
 */
const AddressStep = ({
  view,
  open,
  onSaved,
  onChange,
}: {
  view: CheckoutView
  open: boolean
  /** Saved: move to step 2. `delivery` false when the delivery option couldn't be added. */
  onSaved: (delivery: boolean) => void
  /** "Change" on the summary: back to step 1. */
  onChange: () => void
}) => {
  const { address } = view
  const countryCodes = address.countries.map((c) => c.code)
  const [values, setValues] = useState<AddressFormValues>(() => {
    const start = addressDraft(view.cartId, countryCodes) ?? address.initial
    // A saved address is chosen (after "Change", the one just saved to the
    // account; QA S1-4c, S1): nothing is waiting to be saved.
    return address.savedSelected ? { ...start, saveToAccount: false } : start
  })
  const [savedChoice, setSavedChoice] = useState<string>(address.savedSelected ?? NEW)
  const [errors, setErrors] = useState<AddressErrors>({})
  const [listShown, setListShown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const edited = useRef(new Set<AddressFieldKey>())
  const formRef = useRef<HTMLFormElement>(null)
  const savingRef = useRef(false)

  const headingRef = useRef<HTMLHeadingElement>(null)

  // Kept for Back and "Change": each step change mounts the page afresh.
  useEffect(() => {
    keepAddressDraft(view.cartId, values)
  }, [view.cartId, values])

  useEffect(() => {
    if (open && takeStepFocus("address")) headingRef.current?.focus()
  }, [open])

  // The step can stay mounted while the customer moves between the steps.
  // When the server's view starts selecting a saved address (the one just
  // saved to the account is the cart's address), "Change" shows it chosen,
  // with nothing left to save (QA S1-4c, S1: it showed "Use a new address"
  // with the box still ticked, and Continue saved the address again).
  const lastSelected = useRef(address.savedSelected)
  useEffect(() => {
    if (address.savedSelected === lastSelected.current) return
    lastSelected.current = address.savedSelected
    if (!address.savedSelected) return
    setSavedChoice(address.savedSelected)
    setValues((current) => ({ ...current, saveToAccount: false }))
  }, [address.savedSelected])

  const usingSaved = address.saved.length > 0 && savedChoice !== NEW
  const showAddressFields = !usingSaved

  const setField = (key: AddressFieldKey, value: string) => {
    edited.current.add(key)
    setValues((current) => {
      if (key === "email" || key === "phone") return { ...current, [key]: value }
      const [group, name] = key.split(".") as ["shipping" | "billing", keyof AddressFields]
      const next = { ...current[group], [name]: value }
      // a new country has its own province list
      if (name === "country_code") next.province = ""
      return { ...current, [group]: next }
    })
  }

  const checkOne = (key: AddressFieldKey) => {
    if (!edited.current.has(key)) return
    const message = validateAddressForm(values, countryCodes)[key]
    setErrors((current) => {
      const next = { ...current }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  const focusField = (key: AddressFieldKey) => {
    const element = document.getElementById(fieldId(key))
    element?.focus()
    element?.scrollIntoView?.({ block: "center" })
  }

  // What was typed under "Use a new address", kept while a saved one is chosen.
  const newDraft = useRef<AddressFields | null>(null)

  const chooseSaved = (id: string) => {
    if (id === savedChoice) return
    if (savedChoice === NEW) newDraft.current = values.shipping
    setSavedChoice(id)
    if (id === NEW) {
      // empty, with the account's name (QA S1-4, D14), or what was typed before
      setValues((current) =>
        newDraft.current
          ? { ...current, shipping: newDraft.current }
          : withNewAddress(current, address.accountName)
      )
      return
    }
    const saved = address.saved.find((a) => a.id === id)
    if (saved) setValues((current) => withSavedAddress(current, saved.address))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (savingRef.current) return
    setProblem(null)

    const found = validateAddressForm(values, countryCodes)
    const keys = FIELD_ORDER.filter((key) => found[key])
    if (keys.length > 0) {
      // a saved address with a gap opens the fields, so the message can show
      if (keys.some((k) => k.startsWith("shipping.")) && usingSaved) setSavedChoice(NEW)
      setErrors(found)
      setListShown(keys.length >= 3)
      requestAnimationFrame(() => focusField(keys[0]))
      return
    }

    setErrors({})
    setListShown(false)
    savingRef.current = true
    setSaving(true)
    try {
      const result = await saveAddressStep({
        ...values,
        saveToAccount: address.signedIn && !usingSaved && values.saveToAccount,
      })
      if (result.kind === "saved") {
        onSaved(result.delivery)
      } else if (result.kind === "invalid") {
        setErrors(result.errors)
        const first = FIELD_ORDER.find((key) => result.errors[key])
        if (first) requestAnimationFrame(() => focusField(first))
      } else {
        setProblem(result.kind)
      }
    } catch {
      setProblem("no_answer")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!open) {
    return address.summary ? (
      <section aria-labelledby="step-address-title" data-testid="step-address" data-state="done">
        <div className="flex items-start justify-between gap-3">
          <h2 id="step-address-title" className="type-h2 text-brand-ink">
            {checkoutContent.steps.address.title}
          </h2>
          <button
            type="button"
            onClick={onChange}
            aria-label={words.changeLabel}
            className="min-h-[44px] min-w-[44px] px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2"
            data-testid="change-address"
          >
            {words.change}
          </button>
        </div>
        <AddressSummary summary={address.summary} delivery={view.summary} className="mt-4" />
      </section>
    ) : null
  }

  const text = (
    key: AddressFieldKey,
    label: React.ReactNode,
    props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {}
  ) => {
    const { hint, ...input } = props
    const [group, name] = key.includes(".")
      ? (key.split(".") as ["shipping" | "billing", keyof AddressFields])
      : [null, key as "email" | "phone"]
    const value = group ? values[group][name as keyof AddressFields] : values[name as "email" | "phone"]
    return (
      <TextField
        id={fieldId(key)}
        name={key}
        label={label}
        hint={hint}
        error={errors[key]}
        value={value}
        onChange={(e) => setField(key, e.target.value)}
        onBlur={() => checkOne(key)}
        maxLength={name in FIELD_MAX ? FIELD_MAX[name as keyof typeof FIELD_MAX] : undefined}
        data-testid={`field-${key}`}
        {...input}
      />
    )
  }

  const addressGroup = (group: "shipping" | "billing") => {
    const a = values[group]
    const rules = countryFieldRules(a.country_code)
    const country = address.countries.find((c) => c.code === a.country_code)
    const isShipping = group === "shipping"
    const prefix = isShipping ? "shipping " : "billing "
    return (
      <div className="flex flex-col gap-4">
        <div className={clx("grid gap-4", isShipping && "md:grid-cols-2")}>
          {text(`${group}.first_name`, words.fields.firstName, {
            autoComplete: `${prefix}given-name`,
            dir: "auto",
          })}
          {isShipping &&
            text(`${group}.last_name`, words.fields.lastName, {
              autoComplete: `${prefix}family-name`,
              dir: "auto",
            })}
        </div>
        {isShipping &&
          text(`${group}.company`, words.fields.company, {
            autoComplete: `${prefix}organization`,
            dir: "auto",
          })}
        {address.countries.length > 1 ? (
          <SelectField
            id={fieldId(`${group}.country_code`)}
            name={`${group}.country_code`}
            label={words.fields.country}
            value={a.country_code}
            error={errors[`${group}.country_code`]}
            options={address.countries.map((c) => ({ value: c.code, label: c.name }))}
            onChange={(e) => setField(`${group}.country_code`, e.target.value)}
            autoComplete={`${prefix}country`}
          />
        ) : (
          <TextField
            id={fieldId(`${group}.country_code`)}
            label={words.fields.country}
            value={country?.name ?? a.country_code.toUpperCase()}
            readOnly
            error={errors[`${group}.country_code`]}
            data-testid={`field-${group}.country_code`}
          />
        )}
        {text(`${group}.address_1`, words.fields.address1, {
          autoComplete: `${prefix}address-line1`,
          dir: "auto",
        })}
        {text(`${group}.address_2`, words.fields.address2, {
          autoComplete: `${prefix}address-line2`,
          dir: "auto",
        })}
        {text(`${group}.city`, words.fields.city, {
          autoComplete: `${prefix}address-level2`,
          dir: "auto",
        })}
        {rules.province.shown && (
          <SelectField
            id={fieldId(`${group}.province`)}
            name={`${group}.province`}
            label={rules.province.label}
            value={a.province}
            placeholder={rules.province.placeholder}
            options={rules.province.options}
            error={errors[`${group}.province`]}
            onChange={(e) => setField(`${group}.province`, e.target.value)}
            onBlur={() => checkOne(`${group}.province`)}
            autoComplete={`${prefix}address-level1`}
            data-testid={`field-${group}.province`}
          />
        )}
        {rules.postalCode.shown &&
          text(`${group}.postal_code`, rules.postalCode.label, {
            autoComplete: `${prefix}postal-code`,
            dir: "ltr",
          })}
      </div>
    )
  }

  const errorKeys = FIELD_ORDER.filter((key) => errors[key])

  return (
    <section aria-labelledby="step-address-title" data-testid="step-address" data-state="open">
      <h2 ref={headingRef} id="step-address-title" tabIndex={-1} className="type-h2 text-brand-ink">
        {checkoutContent.steps.address.title}
      </h2>

      <form ref={formRef} noValidate onSubmit={submit} className="mt-6 flex flex-col gap-6">
        {listShown && errorKeys.length >= 3 && (
          <Alert
            variant="error"
            title={words.errorListTitle}
            announce
            data-testid="address-error-list"
          >
            <ul className="flex flex-col">
              {errorKeys.map((key) => (
                <li key={key}>
                  <a
                    href={`#${fieldId(key)}`}
                    onClick={(e) => {
                      e.preventDefault()
                      focusField(key)
                    }}
                    className="inline-flex min-h-[44px] items-center underline underline-offset-4"
                  >
                    {errors[key]}
                  </a>
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {address.saved.length > 0 && (
          <div role="radiogroup" aria-label={words.savedLabel} className="flex flex-col gap-3" data-testid="saved-addresses">
            {address.saved.map((saved) => (
              <RadioCard
                key={saved.id}
                id={`saved-${saved.id}`}
                name="saved-address"
                value={saved.id}
                checked={savedChoice === saved.id}
                onSelect={chooseSaved}
                title={<bdi>{saved.lines[0]}</bdi>}
              >
                {saved.lines.slice(1).map((line, i) => (
                  <span key={i} className="block">
                    <bdi>{line}</bdi>
                  </span>
                ))}
              </RadioCard>
            ))}
            <RadioCard
              id="saved-new"
              name="saved-address"
              value={NEW}
              checked={savedChoice === NEW}
              onSelect={chooseSaved}
              title={words.useNew}
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          {text("email", words.fields.email, {
            type: "email",
            autoComplete: "email",
            dir: "ltr",
            hint: words.fields.emailHint,
          })}
          {text("phone", words.fields.phone, {
            type: "tel",
            autoComplete: "tel",
            dir: "ltr",
            inputMode: "tel",
            hint: words.fields.phoneHint,
          })}
        </div>

        {showAddressFields && addressGroup("shipping")}

        <div className="flex flex-col gap-4">
          <CheckField
            id="checkout-billing-same"
            label={words.billingSame}
            checked={values.billingSame}
            onChange={(checked) => setValues((v) => ({ ...v, billingSame: checked }))}
            data-testid="billing-same"
          />
          {!values.billingSame && (
            <fieldset className="flex flex-col gap-4" data-testid="billing-fields">
              <legend className="mb-4 type-h3 text-brand-ink">{words.billingTitle}</legend>
              {addressGroup("billing")}
            </fieldset>
          )}
          {address.signedIn && showAddressFields && (
            <CheckField
              id="checkout-save-address"
              label={words.saveToAccount}
              checked={values.saveToAccount}
              onChange={(checked) => setValues((v) => ({ ...v, saveToAccount: checked }))}
              data-testid="save-to-account"
            />
          )}
        </div>

        {problem && (
          <Alert
            key={problem}
            variant="error"
            announce
            focusOnMount
            title={
              problem === "cart_lost"
                ? checkoutContent.errors.expiredTitle
                : problem === "server"
                  ? errorContent.server.title
                  : checkoutContent.errors.unreachable
            }
            action={
              problem === "cart_lost" ? (
                <ButtonLink href="/cart" variant="secondary">
                  {checkoutContent.errors.goToCart}
                </ButtonLink>
              ) : undefined
            }
            data-testid="address-problem"
          >
            {problem === "cart_lost" ? checkoutContent.errors.expiredText : undefined}
          </Alert>
        )}

        <Button
          type="submit"
          isLoading={saving}
          loadingText={words.saving}
          className="w-full md:w-auto md:min-w-[240px] md:self-start"
          data-testid="submit-address"
        >
          {words.submit}
        </Button>
      </form>
    </section>
  )
}

export default AddressStep
