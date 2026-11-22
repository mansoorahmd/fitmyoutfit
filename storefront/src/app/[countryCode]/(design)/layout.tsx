import type { Viewport } from "next"

// The designer is full screen and sits under the notch and the home bar of a
// phone: viewport-fit=cover lets env(safe-area-inset-*) report them, and the
// editor page pads itself by them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

/** The designer's frame: no header and no footer; the editor has its own top bar. */
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return children
}
