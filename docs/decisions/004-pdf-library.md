# 004: PDF library for the roster proof

10 Nov 2026. Decided by the coordinator in Sprint 0. One of the three choices dev-plan.md asks Sprint 0 to settle.

## Context

In Sprint 3 the organizer signs a one-page roster proof: every player's name as printed, number, size and garment measurement, plus front and back thumbnails of the design. The proof is also produced as a PDF, stored with the proof approval, and emailed. The PDF is generated on the server from the stored roster snapshot, so it always matches what was signed.

## Decision

- **`@react-pdf/renderer`**, run on the server.
- The proof generator is a **plain TypeScript module**: it takes the roster snapshot, the design thumbnails and the team details, and returns the PDF bytes. It has no Medusa imports, in line with keeping team-order logic portable. Medusa code calls it and stores the result.
- Nothing is built in Sprint 0. The module is written in Sprint 3 with the proof page.

## Alternatives

- **Headless Chromium (Playwright or Puppeteer) printing the web proof page.** The PDF would look exactly like the web page, and any script the browser can render would work. It needs a Chromium binary on the server, which is heavy to host and slow to start.
- **PDFKit or pdf-lib.** Small and fast, but layout is drawn by hand with coordinates. A table that grows with the roster is tedious to maintain.
- **A hosted PDF API.** No server load, but adds a vendor, a per-document cost, and sends player names to a third party.

## Consequences

- The PDF layout is written as React components, a skill the team already has. It is a second layout beside the web proof page, so the two must be kept in step; both read the same roster snapshot.
- Fonts must be registered with the library. The name font in the PDF should be the same font the editor uses, so "name as printed" is truthful.
- **Open risk: non-Latin names.** The library's support for right-to-left scripts (Arabic, Urdu) is weak. If jerseys may carry names in those scripts, this decision should be revisited in favour of headless Chromium. Whether non-Latin names are allowed is a product question for the founders, and it also sets the "allowed characters" rule in Sprint 2.
