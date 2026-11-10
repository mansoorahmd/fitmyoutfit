"use client"

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react"
import { Globe, XMark } from "@medusajs/icons"
import { useId, useState } from "react"

import {
  RegionChoice,
  findRegionChoice,
  regionChipLabel,
} from "@lib/util/region-choices"
import RegionList from "@modules/layout/components/region-list"

type RegionSelectorProps = {
  choices: RegionChoice[]
  currentCountryCode: string
}

/**
 * The header's region chip ("PK · PKR"). It opens the region list as a
 * bottom sheet on phones and a small dialog from 768 px.
 *
 * No flag: the starter's flags are images fetched from a CDN at runtime, and
 * this store does not load images from the web.
 */
const RegionSelector = ({ choices, currentCountryCode }: RegionSelectorProps) => {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const current = findRegionChoice(choices, currentCountryCode)

  if (!current) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border border-brand-on-inverse-muted/60 px-2.5 type-small font-semibold text-brand-on-inverse transition-colors duration-150 ease-out hover:border-brand-on-inverse hover:bg-brand-on-inverse/10 md:px-3"
        data-testid="region-chip"
      >
        <Globe aria-hidden="true" className="hidden md:block" />
        <span>{regionChipLabel(current)}</span>
        <span className="sr-only">, {current.countryName}. Change region</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        className="relative z-[100]"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-brand-ink/50 transition-opacity duration-200 ease-out data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 flex items-end md:items-start md:justify-center md:pt-24">
          <DialogPanel
            transition
            className="w-full rounded-t-sheet bg-brand-surface px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 text-brand-ink shadow-xl transition duration-200 ease-out data-[closed]:translate-y-full md:w-[400px] md:rounded-card md:pb-4 md:data-[closed]:translate-y-0 md:data-[closed]:opacity-0"
            data-testid="region-dialog"
          >
            <div className="flex items-center justify-between">
              <DialogTitle id={titleId} className="type-h3">
                Choose your region
              </DialogTitle>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-brand-surface-alt"
              >
                <XMark aria-hidden="true" />
              </button>
            </div>
            <div className="pt-2">
              <RegionList
                choices={choices}
                currentCountryCode={currentCountryCode}
                onKeep={() => setOpen(false)}
                aria-labelledby={titleId}
              />
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}

export default RegionSelector
