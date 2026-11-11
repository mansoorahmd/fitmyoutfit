"use client"

import { usePathname } from "next/navigation"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  AddedPlacement,
  AddedToCartView,
  addedPlacement,
} from "@lib/util/added-to-cart"

export type AddSource = "main" | "sticky-bar"

export type AddedState = {
  view: AddedToCartView
  placement: AddedPlacement
  source: AddSource
}

type AddedContextValue = {
  added: AddedState | null
  show: (view: AddedToCartView, source: AddSource) => void
  dismiss: () => void
}

const AddedContext = createContext<AddedContextValue>({
  added: null,
  show: () => {},
  dismiss: () => {},
})

export const useAddedToCart = () => useContext(AddedContext)

/** The width from which the header's popover is used (Tailwind's `lg`). */
export const POPOVER_QUERY = "(min-width: 1024px)"

const isWide = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(POPOVER_QUERY).matches

/**
 * Shares the last add between the product page and the header (docs/
 * design/05-m1-pages.md, 4.7): from 1024 px the confirmation is a popover
 * under the cart icon, below that it is inline on the product page. Where
 * it goes is decided at the moment of the add. A page change closes it.
 */
export const AddedToCartProvider = ({ children }: { children: React.ReactNode }) => {
  const [added, setAdded] = useState<AddedState | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    setAdded(null)
  }, [pathname])

  const show = useCallback((view: AddedToCartView, source: AddSource) => {
    setAdded({ view, source, placement: addedPlacement(isWide()) })
  }, [])

  const dismiss = useCallback(() => setAdded(null), [])

  const value = useMemo(() => ({ added, show, dismiss }), [added, show, dismiss])

  return <AddedContext.Provider value={value}>{children}</AddedContext.Provider>
}
