import { Barlow_Condensed, Inter, Noto_Sans_Arabic } from "next/font/google"

// The store's three fonts (direction A, docs/design/03-direction.md),
// self-hosted by next/font at build time. Each sets a CSS variable that
// tailwind.config.js puts in a font stack:
//   font-sans    = Inter, then Noto Sans Arabic for Arabic-script letters
//   font-heading = Barlow Condensed, then Noto Sans Arabic
//
// adjustFontFallback is off on purpose. With it on, next/font puts a metric-
// matched Arial in front of the rest of the stack, and Arial has Arabic
// letters, so Arabic and Urdu names would render in Arial instead of falling
// through to Noto Sans Arabic.

export const headingFont = Barlow_Condensed({
  weight: ["700", "800"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading",
  display: "swap",
  adjustFontFallback: false,
})

export const bodyFont = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: false,
})

export const arabicFont = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
  adjustFontFallback: false,
})

/** Class names that define the three font variables; set on <html>. */
export const fontVariables = [headingFont, bodyFont, arabicFont]
  .map((font) => font.variable)
  .join(" ")
