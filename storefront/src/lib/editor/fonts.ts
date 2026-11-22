import { Graduate, Noto_Sans_Arabic, Oswald } from "next/font/google"

import { primaryFamily } from "@lib/util/font-stack"

// The lettering faces of the designer's placeholder font catalogue
// (packages/editor/samples/fonts/placeholder-fonts.json): the host declares
// the faces, the editor package does not ship font files. next/font
// self-hosts them at build time, and this module is imported only by the
// designer's page, so no other page loads them. next/font gives each face a
// generated family name ("__Oswald_a1b2c3"), so the catalogue's families are
// renamed to those before the editor sees them (see ../../modules/design).
//
// Placeholder: the catalogue and these faces are replaced together when the
// founders' print-tested fonts arrive.

const oswald = Oswald({ weight: "700", subsets: ["latin"], display: "swap" })
const graduate = Graduate({ weight: "400", subsets: ["latin"], display: "swap" })
const notoSansArabic = Noto_Sans_Arabic({
  weight: "700",
  subsets: ["arabic", "latin"],
  display: "swap",
})

/** The family name of a loaded face, without quotes: what `document.fonts` knows it by. */
const bare = (fontFamily: string): string =>
  primaryFamily(fontFamily).replace(/^['"]|['"]$/g, "")

/** The catalogue's family name to the generated one. */
export const editorFontFamilies: Record<string, string> = {
  Oswald: bare(oswald.style.fontFamily),
  Graduate: bare(graduate.style.fontFamily),
  "Noto Sans Arabic": bare(notoSansArabic.style.fontFamily),
}
