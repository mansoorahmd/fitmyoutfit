"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { errorContent } from "@content/errors"
import { Button } from "@modules/common/components/button"

/**
 * The server-error block (docs/design/03-direction.md, "Server failure"):
 * never a raw error, and a "Try again" that reloads the page's data.
 */
const ServerError = () => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div
      className="content-container flex flex-col items-start gap-4 py-12"
      data-testid="server-error"
    >
      <h1 className="type-h1 text-brand-ink">{errorContent.server.title}</h1>
      <Button
        variant="secondary"
        isLoading={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {errorContent.server.retry}
      </Button>
    </div>
  )
}

export default ServerError
