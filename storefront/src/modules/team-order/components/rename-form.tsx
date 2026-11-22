"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { teamOrderContent } from "@content/team-order"
import { renameTeamOrder } from "@lib/data/team-orders"
import { checkTeamName } from "@lib/team-order/validate"
import { failureSentence } from "@lib/team-order/words"
import { Button } from "@modules/common/components/button"
import { TextField } from "@modules/common/components/text-field"

const words = teamOrderContent.order.rename

/**
 * The team name, with "Rename" while the order is a draft (the backend refuses a rename once a proof is
 * out). The name is checked here first (1 to 100 characters, no line breaks); the backend checks it again and
 * its refusal is said in a sentence, never in its own words. Nothing is cut: a name that is too long is refused.
 */
export default function RenameForm({ orderId, teamName, editable }: { orderId: string; teamName: string; editable: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(teamName)
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <h1 className="type-h1 min-w-0 break-words text-brand-ink" dir="auto" data-testid="team-order-title">
          <bdi>{teamName}</bdi>
        </h1>
        {editable && (
          <Button variant="text" onClick={() => { setValue(teamName); setError(undefined); setEditing(true) }} data-testid="team-order-rename">
            {words.edit}
          </Button>
        )}
      </div>
    )
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    const checked = checkTeamName(value)
    if (!checked.ok) {
      setError(teamOrderContent.refusals.team_name_invalid)
      return
    }
    setError(undefined)
    startTransition(async () => {
      const result = await renameTeamOrder(orderId, checked.value)
      if (!result.ok) {
        setError(failureSentence(result.failure))
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <form className="flex max-w-md flex-col gap-3" onSubmit={submit} noValidate data-testid="team-order-rename-form">
      <TextField
        id="team-order-rename"
        label={words.label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error}
        dir="auto"
        autoComplete="off"
        autoFocus
        data-testid="team-order-rename-field"
      />
      <div className="flex gap-3">
        <Button type="submit" isLoading={pending} loadingText={words.saving} data-testid="team-order-rename-save">
          {words.save}
        </Button>
        <Button variant="text" onClick={() => setEditing(false)} disabled={pending}>
          {words.cancel}
        </Button>
      </div>
    </form>
  )
}
