# 005: Roster proof PDF through headless Chromium

10 Nov 2026. Decided by the coordinator in Sprint 0. Replaces [004](004-pdf-library.md).

## Context

Decision 004 chose `@react-pdf/renderer` for the roster proof PDF and flagged one risk: weak support for right-to-left scripts. On 10 Nov 2026 the founder confirmed that jerseys can carry names in Arabic and Urdu script. The proof shows every player's name "as printed", and the organizer signs it. A name that is shaped wrongly on the proof (letters unjoined, or in the wrong order) makes the signed proof worthless, so the PDF must render these scripts exactly as a browser does.

## Decision

- The roster proof PDF is produced by **headless Chromium, driven by Playwright**, printing an HTML proof page to PDF.
- The generator is a **plain TypeScript module** with no Medusa imports: it takes the roster snapshot, the design thumbnails and the team details, builds the HTML, and returns the PDF bytes. Medusa code calls it and stores the result.
- The web proof page and the PDF use **the same HTML template and the same fonts**, so what the organizer signs on screen is what the PDF shows.
- Fonts are **bundled with the application**, not taken from the server's system fonts, and must cover Latin, Arabic and Urdu.
- Nothing is built in Sprint 0. The module is written in Sprint 3 with the proof page.

## Alternatives

- **`@react-pdf/renderer`** (decision 004). Light and easy to host, but its text shaping for Arabic-script languages can't be trusted for a signed document.
- **PDFKit or pdf-lib.** Same shaping problem, plus hand-drawn layout.
- **A hosted PDF API.** Sends player names to a third party and adds a per-document cost.
- **No PDF: keep the proof as a web page only.** Simplest, but the dev plan asks for a PDF, and a stored file is better evidence in a dispute than a page that can be re-rendered.

## Consequences

- The backend's deployment image must include Chromium. The image is larger, and each render uses more memory and time than a pure-JavaScript library. Renders run in the background worker, not in the request that triggers them. The hosting target in [003](003-hosting-target.md) runs containers, so this fits; it should be confirmed in the first deployment.
- One layout instead of two: the web proof and the PDF can't drift apart.
- Local development and CI need Chromium installed through Playwright. The storefront's end-to-end tests will use Playwright too, so the tool is shared.
- Knock-on effects of allowing Arabic and Urdu names, outside this decision:
  - **Roster checks (Sprint 2):** allowed characters cover Latin and Arabic script, and the maximum length is measured per font, not as one fixed character count.
  - **Editor (weeks 5 to 6 and 9 to 10):** text layers must shape right-to-left text correctly, and at least one placeholder font must cover Arabic and Urdu.
  - **CSV upload (Sprint 2):** must read UTF-8 and reject files in other encodings with a clear message.
  - **Printing:** whether partner factories can print these scripts cleanly at jersey size is a production question, outside the store plan.
