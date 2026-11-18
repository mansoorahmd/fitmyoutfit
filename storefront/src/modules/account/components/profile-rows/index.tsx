"use client"

import { useParams, useRouter } from "next/navigation"
import React, { useEffect, useRef, useState } from "react"

import { accountContent } from "@content/account"
import { SaveResult, updateCustomerName, updateCustomerPhone } from "@lib/data/customer"
import { ProfileLinkResult, requestPasswordResetForMe } from "@lib/data/password-reset"
import { authHref } from "@lib/util/account-auth"
import { ProfileValues, afterProfileSave, validateName, validatePhone } from "@lib/util/account-profile"
import { ProfileRow, ProfileRowKey, profileRows } from "@lib/util/account-rows"
import { FIELD_MAX } from "@lib/util/checkout-address"
import { RESET_LINK_MINUTES } from "@lib/util/password-reset"
import { fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import FieldError from "@modules/common/components/field-error"
import { TextField } from "@modules/common/components/text-field"

import StatusToast from "../status-toast"

const words = accountContent.profile

const TEXT_BUTTON =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2 focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"

type Draft = ProfileValues
type DraftErrors = Partial<Record<keyof Draft, string>>

/**
 * The profile's rows (docs/design/05-m1-pages.md, 9.6): each a label, the
 * value and "Edit". Editing opens the fields in place with "Save"
 * (primary) and "Cancel" (text); one row at a time. Saved: a "Saved"
 * message. Failed: "We couldn't save this. Try again." under the row.
 *
 * The page holds the values it shows (QA S1-4c, B2): after a save they are
 * the store's answer, shown at once and the start of the next edit, never
 * the values the page was first rendered with.
 */
const ProfileRows = ({
  initial,
  email,
}: {
  /** The customer's values when the page was rendered. */
  initial: Draft
  /** Shown read-only. */
  email: string
}) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [values, setValues] = useState<Draft>(initial)
  const rows: ProfileRow[] = profileRows({
    first_name: values.firstName,
    last_name: values.lastName,
    phone: values.phone,
    email,
  })
  const [editing, setEditing] = useState<ProfileRowKey | null>(null)
  const [draft, setDraft] = useState<Draft>(initial)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [failed, setFailed] = useState<ProfileRowKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<number | null>(null)
  const busy = useRef(false)
  const linkBusy = useRef(false)
  const [link, setLink] = useState<"idle" | "asking" | "requested" | "failed">("idle")
  const editButtons = useRef<Partial<Record<ProfileRowKey, HTMLButtonElement | null>>>({})
  const firstField = useRef<HTMLInputElement | null>(null)
  const returnFocus = useRef<ProfileRowKey | null>(null)

  useEffect(() => {
    if (editing) {
      firstField.current?.focus()
    } else if (returnFocus.current) {
      editButtons.current[returnFocus.current]?.focus()
      returnFocus.current = null
    }
  }, [editing])

  const start = (key: ProfileRowKey) => {
    setDraft(values)
    setErrors({})
    setFailed(null)
    setEditing(key)
  }

  const stop = (key: ProfileRowKey) => {
    returnFocus.current = key
    setEditing(null)
    setErrors({})
  }

  const save = async (key: ProfileRowKey, event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setFailed(null)
    const found: DraftErrors =
      key === "name"
        ? validateName({ firstName: draft.firstName, lastName: draft.lastName })
        : validatePhone({ phone: draft.phone, countryCode })
    if (Object.keys(found).length > 0) {
      setErrors(found)
      firstField.current?.focus()
      return
    }
    busy.current = true
    setSaving(true)
    let result: SaveResult<DraftErrors> | null = null
    try {
      result =
        key === "name"
          ? await updateCustomerName({ firstName: draft.firstName, lastName: draft.lastName })
          : await updateCustomerPhone({ phone: draft.phone, countryCode })
    } catch {
      result = null
    } finally {
      busy.current = false
      setSaving(false)
    }
    if (result?.kind === "saved") {
      setValues((shown) => afterProfileSave(shown, key === "name" ? "name" : "phone", draft, result.profile))
      stop(key)
      setToast(Date.now())
      // the rest of the page (the greeting, the header) reads the customer again
      router.refresh()
      return
    }
    if (result?.kind === "signed_out") {
      router.push(`/${countryCode}${authHref("signin", { next: "/account/profile" })}`)
      return
    }
    if (result?.kind === "invalid") {
      setErrors(result.errors)
      return
    }
    setFailed(key)
  }

  /**
   * The Password row's button: asks for a reset link to the account's own
   * email (no old password needed). Pressing it again while a request runs
   * does nothing, so a double press sends one request.
   */
  const askForLink = async () => {
    if (linkBusy.current) return
    linkBusy.current = true
    setLink("asking")
    let result: ProfileLinkResult
    try {
      result = await requestPasswordResetForMe()
    } catch {
      result = { kind: "failed" }
    }
    linkBusy.current = false
    if (result.kind === "signed_out") {
      router.push(`/${countryCode}${authHref("signin", { next: "/account/profile" })}`)
      return
    }
    setLink(result.kind === "requested" ? "requested" : "failed")
  }

  const field = (
    key: keyof Draft,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> & { first?: boolean } = {}
  ) => {
    const { first, ...input } = props
    return (
      <TextField
        id={`profile-${key}`}
        label={label}
        value={draft[key]}
        error={errors[key]}
        onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}
        ref={first ? firstField : undefined}
        data-testid={`profile-field-${key}`}
        {...input}
      />
    )
  }

  return (
    <>
      <div className="flex flex-col border-t border-brand-border" data-testid="profile-rows">
        {rows.map((row) => {
          const open = editing === row.key
          return (
            <div key={row.key} className="flex flex-col gap-3 border-b border-brand-border py-4" data-testid={`profile-row-${row.key}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="type-body font-semibold text-brand-ink">{row.label}</p>
                  {!open && (
                    <p
                      dir={row.direction}
                      className={`text-start type-body wrap-anywhere ${row.empty ? "text-brand-ink-muted" : "text-brand-ink"}`}
                      data-testid={`profile-value-${row.key}`}
                    >
                      {row.value}
                    </p>
                  )}
                </div>
                {row.key === "password" && (
                  <button
                    type="button"
                    onClick={askForLink}
                    aria-label={words.password.buttonLabel}
                    aria-busy={link === "asking" || undefined}
                    className={TEXT_BUTTON}
                    data-testid="profile-password-link"
                  >
                    {link === "asking" ? words.password.requesting : words.password.button}
                  </button>
                )}
                {row.editable && !open && (
                  <button
                    ref={(el) => {
                      editButtons.current[row.key] = el
                    }}
                    type="button"
                    onClick={() => start(row.key)}
                    aria-label={fill(words.editLabel, { row: row.label })}
                    className={TEXT_BUTTON}
                    data-testid={`profile-edit-${row.key}`}
                  >
                    {words.edit}
                  </button>
                )}
              </div>
              {row.key === "password" && link === "requested" && (
                <Alert
                  variant="success"
                  announce
                  title={<span className="wrap-anywhere">{fill(words.password.requestedTitle, { email })}</span>}
                  data-testid="profile-password-requested"
                >
                  {fill(words.password.requestedBody, { minutes: RESET_LINK_MINUTES })}
                </Alert>
              )}
              {row.key === "password" && link === "failed" && (
                <Alert variant="error" announce title={words.password.failed} data-testid="profile-password-failed" />
              )}
              {open && (
                <div>
                  <form noValidate onSubmit={(e) => save(row.key, e)} className="flex flex-col gap-4">
                    {row.key === "name" ? (
                      <>
                        {field("firstName", words.fields.firstName, {
                          autoComplete: "given-name",
                          dir: "auto",
                          maxLength: FIELD_MAX.first_name,
                          first: true,
                        })}
                        {field("lastName", words.fields.lastName, {
                          autoComplete: "family-name",
                          dir: "auto",
                          maxLength: FIELD_MAX.last_name,
                        })}
                      </>
                    ) : (
                      field("phone", words.fields.phone, {
                        type: "tel",
                        autoComplete: "tel",
                        dir: "ltr",
                        inputMode: "tel",
                        maxLength: FIELD_MAX.phone,
                        first: true,
                      })
                    )}
                    {failed === row.key && (
                      <FieldError data-testid="profile-save-failed">{words.saveFailed}</FieldError>
                    )}
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <Button type="submit" isLoading={saving} loadingText={words.saving} fullWidth className="md:w-auto" data-testid="profile-save">
                        {words.save}
                      </Button>
                      <Button variant="text" className="self-center md:self-auto" onClick={() => stop(row.key)} data-testid="profile-cancel">
                        {words.cancel}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {toast !== null && (
        <StatusToast message={words.saved} variant="success" messageKey={toast} onClose={() => setToast(null)} />
      )}
    </>
  )
}

export default ProfileRows
