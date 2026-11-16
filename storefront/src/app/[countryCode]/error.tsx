"use client"

import { usePathname } from "next/navigation"

import PageError from "@modules/checkout/components/page-error"

/**
 * The store's error boundary, under every country's pages. It is already
 * loaded when a page fails to load the next page's code: going offline
 * while "Place order" moves to the confirmation (QA S1-4, D12) fails in a
 * part the browser couldn't fetch, and this boundary, sitting above it,
 * catches it. On the checkout and order pages it says the order may have
 * been placed.
 */
export default function StoreError() {
  const pathname = usePathname() ?? ""
  return <PageError orderPage={/\/(checkout|order)(\/|$)/.test(pathname)} />
}
