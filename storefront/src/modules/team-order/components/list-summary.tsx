import { teamOrderContent } from "@content/team-order"
import type { TeamOrderView } from "@lib/team-order/types"
import { listProblemSentences, noteSentence, piecesWords, problemRows } from "@lib/team-order/words"
import { fill } from "@lib/util/wording"

const words = teamOrderContent.order.list

/**
 * The team list's state on the order's page, from the backend's own checks (the editor's checks are the same
 * rules, but the server's answer is the one that counts): how many lines are complete, which lines have a
 * failed check (the line's place and the player's name, and the problem in a sentence), the lines with no
 * size, the pieces per size, and whether the region's minimum is met. It says nothing the backend did not
 * work out.
 */
export default function ListSummary({ order }: { order: TeamOrderView }) {
  const { summary } = order
  const rows = problemRows(order)
  const listProblems = listProblemSentences(order)
  const sizesWithPieces = summary.bySize.filter((s) => s.pieces > 0)
  const noSize = summary.linesWithoutSize

  if (summary.players === 0) {
    return (
      <div className="flex flex-col gap-1" data-testid="list-summary" data-state="empty">
        <p className="type-body">{words.empty}</p>
        <p className="type-small text-brand-ink-muted">{words.emptyHint}</p>
        {summary.minimum && !summary.minimum.met && <MinimumLine order={order} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="list-summary" data-state={summary.linesToFix > 0 ? "fix" : "ready"}>
      <p className="type-body font-semibold" data-testid="list-complete">
        {summary.linesToFix === 0
          ? fill(words.completeAll, { players: summary.players })
          : fill(words.complete, { ready: summary.readyLines, players: summary.players })}
        <span className="font-normal text-brand-ink-muted">
          {" "}
          · {piecesWords(summary.pieces)}
        </span>
      </p>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="list-problems">
          <h3 className="type-h3">{summary.linesToFix === 1 ? words.toFixOne : fill(words.toFix, { n: summary.linesToFix })}</h3>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.index} className="rounded-control border-s-4 border-brand-error bg-brand-surface-alt p-3" data-testid="list-problem" data-line={row.index + 1}>
                <p className="type-body font-semibold" dir="auto">
                  {row.name ? (
                    <>
                      {fill(teamOrderContent.order.list.line, { n: row.index + 1 })} · <bdi>{row.name}</bdi>
                    </>
                  ) : (
                    row.label
                  )}
                </p>
                <ul className="type-small text-brand-ink">
                  {row.sentences.map((sentence, i) => (
                    <li key={i}>
                      <bdi>{sentence}</bdi>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="type-small text-brand-ink-muted">{words.serverChecks}</p>
        </div>
      )}

      {listProblems.length > 0 && (
        <ul className="type-small text-brand-ink" data-testid="list-wide-problems">
          {listProblems.map((sentence, i) => (
            <li key={i}>{sentence}</li>
          ))}
        </ul>
      )}

      {noSize > 0 && (
        <p className="type-body" data-testid="list-no-size">
          {noSize === 1 && summary.piecesWithoutSize === 1
            ? words.noSizeOne
            : noSize === 1
              ? fill(words.noSizeOnePieces, { pieces: summary.piecesWithoutSize })
              : fill(words.noSize, { lines: noSize, pieces: summary.piecesWithoutSize })}
        </p>
      )}

      {(sizesWithPieces.length > 0 || summary.otherSizes.length > 0) && (
        <div className="flex flex-col gap-2" data-testid="list-by-size">
          <h3 className="type-h3">{words.bySizeTitle}</h3>
          <table className="w-full max-w-sm border-collapse type-body">
            <caption className="sr-only">{words.bySizeTitle}</caption>
            <thead>
              <tr className="border-b border-brand-border-strong text-start">
                <th scope="col" className="py-2 text-start type-small font-semibold text-brand-ink-muted">
                  {words.sizeColumn}
                </th>
                <th scope="col" className="py-2 text-end type-small font-semibold text-brand-ink-muted">
                  {words.piecesColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {sizesWithPieces.map((s) => (
                <tr key={s.size} className="border-b border-brand-border" data-testid="list-size-row">
                  <th scope="row" className="py-2 text-start font-normal">
                    <bdi>{s.size}</bdi>
                  </th>
                  <td className="py-2 text-end tabular-nums">{s.pieces}</td>
                </tr>
              ))}
              {summary.otherSizes.map((s) => (
                <tr key={`other-${s.size}`} className="border-b border-brand-border" data-testid="list-size-row">
                  <th scope="row" className="py-2 text-start font-normal">
                    <bdi>{s.size}</bdi> <span className="type-small text-brand-ink-muted">({words.otherSizes})</span>
                  </th>
                  <td className="py-2 text-end tabular-nums">{s.pieces}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-2 text-start font-semibold">
                  {words.total}
                </th>
                <td className="py-2 text-end font-semibold tabular-nums">{summary.pieces}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {summary.minimum && <MinimumLine order={order} />}

      {order.notes.length > 0 && (
        <ul className="type-small text-brand-ink-muted" data-testid="list-notes">
          {Array.from(new Set(order.notes.map(noteSentence).filter(Boolean))).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Below the region's minimum or not: the backend's numbers (`required`, `missing`), a rule of sale worded for the founders to confirm. */
function MinimumLine({ order }: { order: TeamOrderView }) {
  const minimum = order.summary.minimum
  // A region that needs one piece has no minimum to talk about (Pakistan): nothing is said.
  if (!minimum || minimum.required <= 1) return null
  return (
    <p className="type-body" data-testid="list-minimum" data-met={minimum.met ? "true" : "false"}>
      {minimum.met
        ? fill(words.minimumMet, { required: minimum.required })
        : minimum.missing === 1
          ? fill(words.minimumMissingOne, { required: minimum.required })
          : fill(words.minimumMissing, { required: minimum.required, missing: minimum.missing })}
    </p>
  )
}
