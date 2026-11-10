"use client"

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react"
import { BarsThree, ChevronRightMini, XMark } from "@medusajs/icons"
import Image from "next/image"
import { useId, useState } from "react"

import { navigationContent } from "@content/navigation"
import { GarmentLink } from "@lib/util/garment-links"
import { RegionChoice } from "@lib/util/region-choices"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RegionList from "@modules/layout/components/region-list"

type SideMenuProps = {
  regions: RegionChoice[]
  currentCountryCode: string
  garments: GarmentLink[]
}

const groupHeading = "type-small font-semibold uppercase tracking-[0.06em] text-brand-ink-muted px-3"

/**
 * The menu drawer below 1280 px (docs/design/03-direction.md, "Header").
 * It opens from the left at 85% of the width (at most 360 px), white, over a
 * dim backdrop. Headless UI's Dialog traps focus inside it and closes it on
 * Esc and on a press on the backdrop. Contents: the region list, the
 * garments with thumbnails, then Store, Account and Cart. Groups whose pages
 * do not exist yet (Team orders, Help) are left out.
 */
const SideMenu = ({ regions, currentCountryCode, garments }: SideMenuProps) => {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ids = { region: useId(), garments: useId() }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={navigationContent.menuButtonLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-brand-on-inverse transition-colors duration-150 ease-out hover:bg-brand-on-inverse/10 xl:hidden"
        data-testid="nav-menu-button"
      >
        <BarsThree width={24} height={24} aria-hidden="true" />
      </button>

      <Dialog open={open} onClose={close} className="relative z-[100] xl:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-brand-ink/50 transition-opacity duration-200 ease-out data-[closed]:opacity-0"
          data-testid="side-menu-backdrop"
        />
        <DialogPanel
          transition
          className="fixed inset-y-0 left-0 flex w-[85%] max-w-[360px] flex-col overflow-y-auto bg-brand-surface text-brand-ink shadow-xl transition-transform duration-200 ease-out data-[closed]:-translate-x-full"
          data-testid="nav-menu-popup"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-brand-border pl-4 pr-2">
            <DialogTitle className="type-h3">
              {navigationContent.menuButtonLabel}
            </DialogTitle>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-brand-surface-alt"
              data-testid="close-menu-button"
            >
              <XMark width={20} height={20} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-6 px-1 py-4">
            {regions.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 id={ids.region} className={groupHeading}>
                  {navigationContent.regionHeading}
                </h2>
                <RegionList
                  choices={regions}
                  currentCountryCode={currentCountryCode}
                  onKeep={close}
                  aria-labelledby={ids.region}
                />
              </section>
            )}

            {garments.length > 0 && (
              <section className="flex flex-col gap-2 border-t border-brand-border pt-4">
                <h2 id={ids.garments} className={groupHeading}>
                  {navigationContent.garmentsHeading}
                </h2>
                <ul aria-labelledby={ids.garments} className="flex flex-col gap-1">
                  {garments.map((garment) => (
                    <li key={garment.id}>
                      <LocalizedClientLink
                        href={garment.href}
                        onClick={close}
                        className="flex min-h-[56px] items-center gap-3 rounded-control px-3 py-1 hover:bg-brand-surface-alt"
                        data-testid="menu-garment-link"
                      >
                        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-control bg-brand-surface-alt">
                          {garment.thumbnail && (
                            <Image
                              src={garment.thumbnail}
                              alt=""
                              fill
                              sizes="48px"
                              className="object-contain"
                            />
                          )}
                        </span>
                        <span className="flex-1 type-body font-semibold">
                          {garment.title}
                        </span>
                        <ChevronRightMini aria-hidden="true" className="text-brand-ink-muted" />
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <nav aria-label="More" className="border-t border-brand-border pt-4">
              <ul className="flex flex-col gap-1">
                {navigationContent.drawerLinks.map((link) => (
                  <li key={link.href}>
                    <LocalizedClientLink
                      href={link.href}
                      onClick={close}
                      className="flex min-h-[48px] items-center rounded-control px-3 type-body font-semibold hover:bg-brand-surface-alt"
                      data-testid={`${link.label.toLowerCase()}-link`}
                    >
                      {link.label}
                    </LocalizedClientLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </DialogPanel>
      </Dialog>
    </>
  )
}

export default SideMenu
