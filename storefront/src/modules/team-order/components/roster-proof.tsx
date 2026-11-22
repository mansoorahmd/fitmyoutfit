import type { ReactNode } from "react"

import { proofContent } from "@content/proof"
import { PROOF_CSS } from "@lib/team-order/proof-css"
import type { ProofDocument } from "@lib/team-order/proof"
import { fill } from "@lib/util/wording"

const w = proofContent.document

/**
 * The roster proof: the one page the organizer checks and signs, and prints. A plain component: it takes a
 * `ProofDocument` (built from the proof's snapshot) and a slot for the pictures of the kit, fetches nothing and
 * holds no state, so the server module that makes the PDF later (decision 005) renders exactly this. Its own
 * stylesheet comes with it (lib/team-order/proof-css.ts): the phone look, and the print look that fits up to 25
 * lines on one A4 page and repeats the table's head on the next ones.
 *
 * Names are in their own cells with `dir="auto"` inside `<bdi>`, so an Urdu or Arabic name is shaped and ordered
 * right to left without turning the table round, and "(7)" next to it never jumps.
 */
export default function RosterProof({ document: d, pictures }: { document: ProofDocument; pictures?: ReactNode }) {
  const t = w.table
  const measureHead = d.measurement ? fill(t.measurement, { labels: d.measurement.labels, unit: d.measurement.unit }) : null
  const players = d.totals.players === 1 ? w.totals.playersOne : fill(w.totals.players, { players: d.totals.players })
  const pieces = d.totals.pieces === 1 ? w.totals.piecesOne : fill(w.totals.pieces, { pieces: d.totals.pieces })
  const repeated = `${d.teamName} · ${fill(w.madeOn, { number: d.number, date: d.madeOn })}`

  return (
    <article className="fmo-proof" data-testid="roster-proof" data-status={d.status} aria-label={`${w.heading}: ${d.teamName}`}>
      <style>{PROOF_CSS}</style>

      <header className="fmo-proof-head">
        <p className="fmo-proof-kicker">{w.heading}</p>
        <h1 className="fmo-proof-team" dir="auto" data-testid="proof-team">
          <bdi>{d.teamName}</bdi>
        </h1>
        <p className="fmo-proof-meta" data-testid="proof-meta">
          <b dir="auto">
            <bdi>{d.productName}</bdi>
          </b>
          {" · "}
          {fill(w.madeOn, { number: d.number, date: d.madeOn })}
          {d.needBy ? ` · ${fill(w.needBy, { date: d.needBy })}` : ""}
        </p>
        <p className="fmo-proof-meta fmo-proof-code" data-testid="proof-code">
          {fill(w.code, { code: d.code })}
        </p>
      </header>

      {pictures ? (
        <section className="fmo-proof-pictures" aria-label={w.pictures.title} data-testid="proof-pictures">
          {pictures}
        </section>
      ) : null}

      <section className="fmo-proof-section" aria-label={t.caption}>
        <table className="fmo-proof-table" data-testid="proof-table">
          <caption>{t.caption}</caption>
          <thead>
            <tr className="fmo-print-only-row" aria-hidden="true">
              <th colSpan={4 + (d.showNumber ? 1 : 0)}>
                <span className="fmo-proof-repeat">{repeated}</span>
              </th>
            </tr>
            <tr>
              <th scope="col" className="c-pos">
                <span aria-hidden="true">{t.position}</span>
                <span className="sr-only">{t.positionLong}</span>
              </th>
              <th scope="col" className="c-name">
                {d.showName ? t.name : `${t.name} (${t.notPrinted})`}
              </th>
              {d.showNumber && (
                <th scope="col" className="c-num">
                  {t.number}
                </th>
              )}
              <th scope="col" className="c-size">
                {t.size}
                {measureHead ? <span className="meas">{measureHead}</span> : null}
              </th>
              <th scope="col" className="c-count">
                {t.count}
              </th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row) => (
              <tr key={row.position} className={row.spare ? "spare" : undefined} data-testid="proof-row" data-line={row.position}>
                <td className="c-pos">{row.position}</td>
                <td className={`name${row.nameIsWords ? " words" : ""}`} data-testid="proof-name">
                  {row.name === null ? (
                    <span className="words">{t.notPrinted}</span>
                  ) : row.nameIsWords ? (
                    row.name
                  ) : (
                    <bdi dir="auto" data-testid="proof-name-text">
                      {row.name}
                    </bdi>
                  )}
                </td>
                {d.showNumber && (
                  <td className={`c-num${row.numberIsWords ? " words" : ""}`} dir={row.numberIsWords ? undefined : "ltr"} data-testid="proof-number">
                    {row.number}
                  </td>
                )}
                <td className="c-size" data-testid="proof-size">
                  <span className="size">
                    <bdi>{row.size}</bdi>
                  </span>
                  {row.measurement ? (
                    <span className="meas" data-testid="proof-measurement">
                      {row.measurement}
                    </span>
                  ) : null}
                </td>
                <td className="c-count" data-testid="proof-count">
                  {row.count === 1 ? "1" : fill(t.times, { count: row.count })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fmo-proof-note" data-testid="proof-measurement-note">
          {d.measurement
            ? fill(d.measurement.draft ? w.measurementNote.draft : w.measurementNote.final, {
                labels: d.measurement.labels,
                unit: d.measurement.unit,
              })
            : w.measurementNote.none}
        </p>
      </section>

      <section className="fmo-proof-section fmo-proof-totals" aria-label={w.totals.title} data-testid="proof-totals">
        <p className="fmo-proof-total-line">
          <span data-testid="proof-players">{players}</span> · <span data-testid="proof-pieces">{pieces}</span>
        </p>
        {d.totals.bySize.length > 0 && (
          <>
            <h2 className="fmo-proof-h">{w.totals.bySize}</h2>
            <ul className="fmo-proof-sizes" data-testid="proof-by-size">
              {d.totals.bySize.map((s) => (
                <li key={s.size} data-testid="proof-size-total">
                  <b>
                    <bdi>{s.size}</bdi>
                  </b>
                  <span>{s.other ? `${s.pieces} (${w.totals.otherSizes})` : s.pieces}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <footer className="fmo-proof-foot">
        <p data-testid="proof-signature" dir="auto">
          <bdi>{d.signature}</bdi>
        </p>
      </footer>
    </article>
  )
}
