"use client"

import React, { useRef, useState } from "react"

import { accountContent } from "@content/account"
import { checkoutContent } from "@content/checkout"
import { addCustomerAddress, updateCustomerAddress } from "@lib/data/customer"
import {
  ACCOUNT_ADDRESS_FIELDS,
  AccountAddressErrors,
  AccountAddressKey,
  AccountAddressValues,
  validateAccountAddress,
} from "@lib/util/account-address"
import { AddressFields, CountryChoice, countryFieldRules } from "@lib/util/checkout-address"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import CheckField from "@modules/common/components/check-field"
import { SelectField, TextField } from "@modules/common/components/text-field"

import ErrorList, { focusField } from "../error-list"

const words = accountContent.addresses
const fieldWords = checkoutContent.address.fields

const fieldId = (key: AccountAddressKey) => `address-${key}`

export type AddressFormOutcome = "saved" | "signed_out"

/**
 * The account's address form (docs/design/05-m1-pages.md, 9.5): the
 * checkout's fields (6.4, rows 3 and 5 to 11) with the phone and "Make
 * this my default address", the checkout's checks and messages. Shown in
 * a Sheet; its footer sticks to the bottom with "Save address" and
 * "Cancel".
 */
const AddressForm = ({
  addressId,
  initial,
  countries,
  onDone,
  onCancel,
}: {
  /** The address being edited, or none for a new one. */
  addressId?: string
  initial: AccountAddressValues
  countries: CountryChoice[]
  onDone: (outcome: AddressFormOutcome) => void
  onCancel: () => void
}) => {
  const countryCodes = countries.map((c) => c.code)
  const [values, setValues] = useState<AccountAddressValues>(initial)
  const [errors, setErrors] = useState<AccountAddressErrors>({})
  const [listShown, setListShown] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const edited = useRef(new Set<AccountAddressKey>())
  const busy = useRef(false)

  const setField = (key: AccountAddressKey, value: string) => {
    edited.current.add(key)
    const next: AccountAddressValues =
      key === "phone"
        ? { ...values, phone: value }
        : {
            ...values,
            // a new country has its own province list
            address: { ...values.address, [key]: value, ...(key === "country_code" ? { province: "" } : {}) },
          }
    setValues(next)
    // a message already shown goes as soon as the field is right
    if (errors[key] && !validateAccountAddress(next, countryCodes)[key]) {
      setErrors((current) => {
        const rest = { ...current }
        delete rest[key]
        return rest
      })
    }
  }

  const checkOne = (key: AccountAddressKey) => {
    if (!edited.current.has(key)) return
    const message = validateAccountAddress(values, countryCodes)[key]
    setErrors((current) => {
      const next = { ...current }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  const showErrors = (found: AccountAddressErrors) => {
    const keys = ACCOUNT_ADDRESS_FIELDS.filter((key) => found[key])
    setErrors(found)
    setListShown(keys.length >= 3)
    if (keys[0]) requestAnimationFrame(() => focusField(fieldId(keys[0])))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setFailed(false)
    const found = validateAccountAddress(values, countryCodes)
    if (Object.keys(found).length > 0) {
      showErrors(found)
      return
    }
    setErrors({})
    setListShown(false)
    busy.current = true
    setSaving(true)
    try {
      const result = addressId
        ? await updateCustomerAddress(addressId, values)
        : await addCustomerAddress(values)
      if (result.kind === "saved" || result.kind === "signed_out") {
        onDone(result.kind)
        return
      }
      if (result.kind === "invalid") showErrors(result.errors)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const a = values.address
  const rules = countryFieldRules(a.country_code)

  const text = (
    key: keyof AddressFields | "phone",
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {}
  ) => (
    <TextField
      id={fieldId(key)}
      name={key}
      label={label}
      error={errors[key]}
      value={key === "phone" ? values.phone : a[key]}
      onChange={(e) => setField(key, e.target.value)}
      onBlur={() => checkOne(key)}
      data-testid={`address-field-${key}`}
      {...props}
    />
  )

  const errorKeys = ACCOUNT_ADDRESS_FIELDS.filter((key) => errors[key])

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6" data-testid="address-form">
      {listShown && errorKeys.length >= 3 && (
        <ErrorList
          items={errorKeys.map((key) => ({ id: fieldId(key), message: errors[key] as string }))}
          onPick={focusField}
        />
      )}
      {/* a field scrolled into view stops above the sticky footer, not under it */}
      <div className="flex flex-col gap-4 [&_input]:scroll-mb-28 [&_select]:scroll-mb-28 md:[&_input]:scroll-mb-0 md:[&_select]:scroll-mb-0">
        <div className="grid gap-4 md:grid-cols-2">
          {text("first_name", fieldWords.firstName, { autoComplete: "given-name", dir: "auto" })}
          {text("last_name", fieldWords.lastName, { autoComplete: "family-name", dir: "auto" })}
        </div>
        {text("company", fieldWords.company, { autoComplete: "organization", dir: "auto" })}
        <SelectField
          id={fieldId("country_code")}
          name="country_code"
          label={fieldWords.country}
          value={a.country_code}
          error={errors.country_code}
          options={countries.map((c) => ({ value: c.code, label: c.name }))}
          onChange={(e) => setField("country_code", e.target.value)}
          autoComplete="country"
          data-testid="address-field-country_code"
        />
        {text("address_1", fieldWords.address1, { autoComplete: "address-line1", dir: "auto" })}
        {text("address_2", fieldWords.address2, { autoComplete: "address-line2", dir: "auto" })}
        {text("city", fieldWords.city, { autoComplete: "address-level2", dir: "auto" })}
        {rules.province.shown && (
          <SelectField
            id={fieldId("province")}
            name="province"
            label={rules.province.label}
            value={a.province}
            placeholder={fieldWords.chooseProvince}
            options={rules.province.options}
            error={errors.province}
            onChange={(e) => setField("province", e.target.value)}
            onBlur={() => checkOne("province")}
            autoComplete="address-level1"
            data-testid="address-field-province"
          />
        )}
        {rules.postalCode.shown &&
          text("postal_code", rules.postalCode.label, { autoComplete: "postal-code", dir: "ltr" })}
        {text("phone", fieldWords.phone, {
          type: "tel",
          autoComplete: "tel",
          dir: "ltr",
          inputMode: "tel",
          hint: fieldWords.phoneHint,
        })}
        <CheckField
          id="address-default"
          label={words.makeDefault}
          checked={values.isDefault}
          onChange={(checked) => setValues((current) => ({ ...current, isDefault: checked }))}
          data-testid="address-make-default"
        />
      </div>

      {failed && (
        <Alert variant="error" announce focusOnMount title={words.saveFailed} data-testid="address-save-failed" />
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-brand-border bg-brand-surface px-4 py-3 md:static md:mx-0 md:border-0 md:px-0 md:py-0">
        <Button type="submit" isLoading={saving} loadingText={words.saving} className="min-w-0 flex-1 md:flex-none" data-testid="address-save">
          {words.save}
        </Button>
        <Button type="button" variant="text" onClick={onCancel} className="shrink-0" data-testid="address-cancel">
          {words.cancel}
        </Button>
      </div>
    </form>
  )
}

export default AddressForm
