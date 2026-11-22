"use client"

import dynamic from "next/dynamic"
import { Component, useEffect, useState, type ReactNode } from "react"

import { designContent } from "@content/design"
import type { DesignerContext } from "@lib/editor/designer-context"
import type { EditorProduct } from "@lib/editor/products"
import { webglAvailable } from "@lib/editor/webgl"

import DesignLoading from "./design-loading"
import DesignMessage from "./design-message"

export type DesignLoaderProps = {
  product: EditorProduct
  countryCode: string
  /** The font catalogue's family names to the faces next/font generated. */
  fontFamilies: Record<string, string>
  /** The visitor, the product's sizes, the region, and the team order when the address names one. */
  context: DesignerContext
}

// The editor, Three.js and the model's code load here and nowhere else, in
// the browser only: no server rendering of the 3D canvas, and no other page
// of the store carries this code.
const DesignEditor = dynamic(() => import("./design-editor"), {
  ssr: false,
  loading: () => <DesignLoading />,
})

type Support = "checking" | "yes" | "no"

/** Catches a failed load of the editor's code (or any crash inside it): a message and a way back, never a blank page. */
export class DesignErrorBoundary extends Component<
  { handle: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error("The 3D designer failed:", error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <DesignMessage
        title={designContent.failed.title}
        text={designContent.failed.text}
        backHref={`/products/${this.props.handle}`}
        backLabel={designContent.back}
        action={{ label: designContent.failed.retry, onClick: () => window.location.reload() }}
      />
    )
  }
}

/**
 * The designer page's body. It checks for WebGL first (a browser without it
 * gets a message with a way back), then loads the editor. A failed load of
 * the editor's code or of the model shows a message with "Try again" and a
 * way back.
 */
export default function DesignLoader(props: DesignLoaderProps) {
  const [support, setSupport] = useState<Support>("checking")

  useEffect(() => {
    setSupport(webglAvailable() ? "yes" : "no")
  }, [])

  if (support === "checking") return <DesignLoading />
  if (support === "no") {
    return (
      <DesignMessage
        title={designContent.noWebgl.title}
        text={designContent.noWebgl.text}
        backHref={`/products/${props.product.handle}`}
        backLabel={designContent.back}
      />
    )
  }
  return (
    <DesignErrorBoundary handle={props.product.handle}>
      <DesignEditor {...props} />
    </DesignErrorBoundary>
  )
}
