"use client"

import { teamOrderContent } from "@content/team-order"
import type { ListSaveState } from "@lib/team-order/list-saver"
import { Button, ButtonLink } from "@modules/common/components/button"

const words = teamOrderContent.designer

/**
 * Tells the organizer when the team list is not on the order: not saved (and why), or changed somewhere
 * else (the same order open in two tabs or on two devices). The editor's top bar says "Not saved" too; it
 * has no button of its own for it, so the retry lives here. Nothing is shown while all is well.
 * A conflict asks, and throws nothing away until the organizer chooses.
 */
export default function ListSaveBanner({
  state,
  signInHref,
  busy,
  onRetry,
  onKeepMine,
  onUseSaved,
}: {
  state: ListSaveState
  /** A path without the country code. */
  signInHref: string
  /** The saved list is being read again. */
  busy: boolean
  onRetry: () => void
  onKeepMine: () => void
  onUseSaved: () => void
}) {
  if (state.kind === "conflict") {
    return (
      <div
        role="alert"
        className="fixed inset-x-3 top-16 z-20 mx-auto flex max-w-xl flex-col gap-3 rounded-card border border-brand-border bg-brand-surface-alt p-4 type-small text-brand-ink shadow-lg"
        data-testid="list-conflict"
      >
        <p className="type-body font-semibold">{words.conflict.title}</p>
        <p>{words.conflict.text}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onKeepMine} fullWidth className="sm:w-auto" data-testid="list-conflict-keep">
            {words.conflict.keepMine}
          </Button>
          <Button variant="secondary" onClick={onUseSaved} isLoading={busy} fullWidth className="sm:w-auto" data-testid="list-conflict-use-saved">
            {words.conflict.useSaved}
          </Button>
        </div>
        <p className="text-brand-ink-muted">{words.conflict.useSavedNote}</p>
      </div>
    )
  }
  if (state.kind !== "failed") return null
  const text =
    state.reason === "network"
      ? words.saveFailed.network
      : state.reason === "refused"
        ? words.saveFailed.refused
        : state.reason === "signed_out"
          ? words.saveFailed.signedOut
          : state.reason === "locked"
            ? words.saveFailed.locked
            : words.saveFailed.gone
  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-16 z-20 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-card border border-brand-border bg-brand-surface-alt p-3 type-small text-brand-ink shadow-lg"
      data-testid="list-save-failed"
      data-reason={state.reason}
    >
      <span className="min-w-0 flex-1">{text}</span>
      {state.reason === "signed_out" ? (
        <ButtonLink href={signInHref} variant="secondary" data-testid="list-save-sign-in">
          {words.saveFailed.signIn}
        </ButtonLink>
      ) : state.reason === "locked" || state.reason === "gone" ? (
        <ButtonLink href="/account/team-orders" variant="secondary">
          {words.saveFailed.openOrders}
        </ButtonLink>
      ) : (
        <Button variant="secondary" onClick={onRetry} data-testid="list-save-retry">
          {words.saveFailed.retry}
        </Button>
      )}
    </div>
  )
}
