"use client"

import PageError from "@modules/checkout/components/page-error"

/**
 * The checkout's error boundary (QA S1-4, D12): what is true when the page
 * stops working, often the connection going while the order is placed.
 */
export default function CheckoutError() {
  return <PageError orderPage />
}
