"use client"

import { useSyncExternalStore } from "react"

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/**
 * Whether the browser says it is online (`navigator.onLine`), kept up to
 * date by its online and offline events. True on the server, so the page
 * never renders offline before the browser says so.
 */
export const useOnline = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
