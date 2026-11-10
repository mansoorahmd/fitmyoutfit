import { fontFaceStyle, fontVariables } from "@lib/fonts"
import { STORE_NAME } from "@lib/store-config"
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  applicationName: STORE_NAME,
  openGraph: { siteName: STORE_NAME },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-mode="light"
      className={fontVariables}
      style={fontFaceStyle as React.CSSProperties}
    >
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
