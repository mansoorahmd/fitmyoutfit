// What the designer tells the editor when a team order's list cannot be changed (docs/design/08-team-list.md,
// 11.3; the editor's `teamList.locked = { signedOn, onChangeList }`): the line at the top of the read-only list
// and whether "Change the list" is offered. Plain function, tested on its own (locked-list.test.ts).
//
// Going back is the organizer's own right only while a proof is out or signed (contract section 3: from
// `proof_sent` and `approved`, never after the deposit). So "Change the list" is offered for those two states and
// no other; a later status says where the order is and offers nothing.

import { proofContent } from "@content/proof"
import { teamOrderContent } from "@content/team-order"
import { dayOfMoment } from "@lib/team-order/proof"
import type { TeamOrderView } from "@lib/team-order/types"
import { statusWords } from "@lib/team-order/words"

export type LockedListPlan = {
  /** The text the editor puts in the note's `{date}`. */
  signedOn: string
  /**
   * "signed": the editor's own sentence ("Signed on {date}. Changing the list makes a new proof."), with the date.
   * "plain": the note is `signedOn` as it stands (the editor's sentence would name a signature that does not exist).
   */
  note: "signed" | "plain"
  /** Whether "Change the list" is offered. */
  canChange: boolean
}

/**
 * The plan for a locked list. `unreadable` is a draft whose list the editor cannot open (it is shown read-only, and
 * nothing can be changed from here).
 */
export function lockedListPlan(view: Pick<TeamOrderView, "status" | "currentProof">, options: { unreadable?: boolean } = {}): LockedListPlan {
  if (view.status === "draft") {
    return { signedOn: options.unreadable ? teamOrderContent.designer.listUnreadable.note : "", note: "plain", canChange: false }
  }
  if (view.status === "proof_sent") {
    return { signedOn: proofContent.designer.lockedSent, note: "plain", canChange: true }
  }
  if (view.status === "approved") {
    const date = dayOfMoment(view.currentProof?.signedAt)
    return date
      ? { signedOn: date, note: "signed", canChange: true }
      : { signedOn: statusWords(view.status).text, note: "plain", canChange: true }
  }
  return { signedOn: statusWords(view.status).text, note: "plain", canChange: false }
}
