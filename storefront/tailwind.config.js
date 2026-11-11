const { packageContentGlob, toGlob } = require("./tailwind.paths")

// Every content path is absolute. Tailwind reads relative paths from the
// current working directory, not from this file, and a package may be
// installed here or hoisted to a parent node_modules. See tailwind.paths.js.
const CONTENT_EXTENSIONS = "{js,ts,jsx,tsx}"

// Brand colour tokens (direction A, "Matchday"; docs/design/03-direction.md).
// Values live in src/styles/globals.css as --c-<token> RGB triplets, so a
// change of look is a change of values there, not of components. Components
// use these as `bg-brand-ink`, `text-brand-ink-muted/80` and so on, never raw
// hex. `primary` is for the main button only.
const BRAND_COLOR_TOKENS = [
  "bg",
  "surface",
  "surface-alt",
  "ink",
  "ink-muted",
  "inverse",
  "on-inverse",
  "on-inverse-muted",
  "primary",
  "primary-hover",
  "on-primary",
  "accent",
  "border",
  "border-strong",
  "success",
  "error",
  "focus",
  // M1 (docs/design/05-m1-pages.md, 2.1): alert backgrounds only
  "error-surface",
  "success-surface",
]

const brandColors = Object.fromEntries(
  BRAND_COLOR_TOKENS.map((token) => [
    token,
    `rgb(var(--c-${token}) / <alpha-value>)`,
  ])
)

module.exports = {
  darkMode: "class",
  // require() finds the preset wherever npm installed it (here or hoisted).
  presets: [require("@medusajs/ui-preset")],
  content: [
    toGlob(__dirname, `src/app/**/*.${CONTENT_EXTENSIONS}`),
    toGlob(__dirname, `src/pages/**/*.${CONTENT_EXTENSIONS}`),
    toGlob(__dirname, `src/components/**/*.${CONTENT_EXTENSIONS}`),
    toGlob(__dirname, `src/modules/**/*.${CONTENT_EXTENSIONS}`),
    packageContentGlob(
      "@medusajs/ui",
      __dirname,
      `dist/**/*.${CONTENT_EXTENSIONS}`
    ),
  ],
  theme: {
    extend: {
      transitionProperty: {
        width: "width margin",
        height: "height",
        bg: "background-color",
        display: "display opacity",
        visibility: "visibility",
        padding: "padding-top padding-right padding-bottom padding-left",
      },
      colors: {
        brand: brandColors,
        grey: {
          0: "#FFFFFF",
          5: "#F9FAFB",
          10: "#F3F4F6",
          20: "#E5E7EB",
          30: "#D1D5DB",
          40: "#9CA3AF",
          50: "#6B7280",
          60: "#4B5563",
          70: "#374151",
          80: "#1F2937",
          90: "#111827",
        },
      },
      borderRadius: {
        none: "0px",
        soft: "2px",
        base: "4px",
        rounded: "8px",
        large: "16px",
        circle: "9999px",
        // brand radii, set per direction in globals.css
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        sheet: "var(--radius-sheet)",
      },
      maxWidth: {
        "8xl": "100rem",
        // brand content width (gutters are added by .content-container)
        content: "1200px",
      },
      // Spacing needs no extension: Tailwind's default scale is the brand's
      // 4 px scale (1 = 4 px, 2 = 8, 3 = 12, 4 = 16, 6 = 24, 8 = 32,
      // 12 = 48, 16 = 64, 24 = 96).
      screens: {
        "2xsmall": "320px",
        xsmall: "512px",
        small: "1024px",
        medium: "1280px",
        large: "1440px",
        xlarge: "1680px",
        "2xlarge": "1920px",
      },
      fontSize: {
        "3xl": "2rem",
      },
      // The variables are set in src/app/layout.tsx from src/lib/fonts.ts.
      // Order: the real face, then Noto Sans Arabic's real face (so Arabic
      // and Urdu letters use it), then next/font's metric-matched fallbacks
      // and system fonts. See src/lib/util/font-stack.ts.
      fontFamily: {
        sans: [
          "var(--font-body-face)",
          "var(--font-arabic-face)",
          "var(--font-body)",
          "var(--font-arabic)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
        heading: [
          "var(--font-heading-face)",
          "var(--font-arabic-face)",
          "var(--font-heading)",
          "var(--font-arabic)",
          "Arial Narrow",
          "sans-serif",
        ],
      },
      keyframes: {
        ring: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "fade-in-right": {
          "0%": {
            opacity: "0",
            transform: "translateX(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "fade-in-top": {
          "0%": {
            opacity: "0",
            transform: "translateY(-10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-out-top": {
          "0%": {
            height: "100%",
          },
          "99%": {
            height: "0",
          },
          "100%": {
            visibility: "hidden",
          },
        },
        "accordion-slide-up": {
          "0%": {
            height: "var(--radix-accordion-content-height)",
            opacity: "1",
          },
          "100%": {
            height: "0",
            opacity: "0",
          },
        },
        "accordion-slide-down": {
          "0%": {
            "min-height": "0",
            "max-height": "0",
            opacity: "0",
          },
          "100%": {
            "min-height": "var(--radix-accordion-content-height)",
            "max-height": "none",
            opacity: "1",
          },
        },
        enter: {
          "0%": { transform: "scale(0.9)", opacity: 0 },
          "100%": { transform: "scale(1)", opacity: 1 },
        },
        leave: {
          "0%": { transform: "scale(1)", opacity: 1 },
          "100%": { transform: "scale(0.9)", opacity: 0 },
        },
        "slide-in": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        ring: "ring 2.2s cubic-bezier(0.5, 0, 0.5, 1) infinite",
        "fade-in-right":
          "fade-in-right 0.3s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "fade-in-top": "fade-in-top 0.2s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "fade-out-top":
          "fade-out-top 0.2s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "accordion-open":
          "accordion-slide-down 300ms cubic-bezier(0.87, 0, 0.13, 1) forwards",
        "accordion-close":
          "accordion-slide-up 300ms cubic-bezier(0.87, 0, 0.13, 1) forwards",
        enter: "enter 200ms ease-out",
        "slide-in": "slide-in 1.2s cubic-bezier(.41,.73,.51,1.02)",
        leave: "leave 150ms ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-radix")()],
}
