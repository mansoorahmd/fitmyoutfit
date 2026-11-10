import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Transition,
} from "@headlessui/react"
import { clx } from "@medusajs/ui"
import React, { Fragment, useMemo } from "react"

import useToggleState from "@lib/hooks/use-toggle-state"
import { Button } from "@modules/common/components/button"
import ChevronDown from "@modules/common/icons/chevron-down"
import X from "@modules/common/icons/x"

import { getAddToCartState } from "@lib/util/add-to-cart-state"
import { getProductPrice } from "@lib/util/get-product-price"
import { optionSummaryLabel } from "@lib/util/option-summary"
import { isSimpleProduct } from "@lib/util/product"
import { HttpTypes } from "@medusajs/types"
import OptionSelect from "./option-select"

type MobileActionsProps = {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  options: Record<string, string | undefined>
  unavailableValues?: string[]
  updateOptions: (title: string, value: string) => void
  isValidVariant?: boolean
  needsSelection: boolean
  handleAddToCart: () => void
  isAdding?: boolean
  show: boolean
  optionsDisabled: boolean
}

const MobileActions: React.FC<MobileActionsProps> = ({
  product,
  variant,
  options,
  unavailableValues,
  updateOptions,
  isValidVariant,
  needsSelection,
  handleAddToCart,
  isAdding,
  show,
  optionsDisabled,
}) => {
  const { state, open, close } = useToggleState()

  const price = getProductPrice({
    product: product,
    variantId: variant?.id,
  })

  const selectedPrice = useMemo(() => {
    if (!price) {
      return null
    }
    const { variantPrice, cheapestPrice } = price

    return variantPrice || cheapestPrice || null
  }, [price])

  const isSimple = isSimpleProduct(product)

  const addToCartState = getAddToCartState({
    variant,
    isValidVariant,
    needsSelection,
  })

  return (
    <>
      <div
        className={clx("lg:hidden inset-x-0 bottom-0 fixed z-50", {
          "pointer-events-none": !show,
        })}
      >
        <Transition
          as={Fragment}
          show={show}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="bg-brand-surface flex flex-col gap-y-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] w-full border-t border-brand-border text-brand-ink"
            data-testid="mobile-actions"
          >
            <div className="flex items-center justify-between gap-x-2 type-small">
              <span data-testid="mobile-title" className="font-semibold">
                {product.title}
              </span>
              {selectedPrice && (
                <span className="flex items-end gap-x-2">
                  {selectedPrice.price_type === "sale" && (
                    <span className="line-through text-brand-ink-muted">
                      {selectedPrice.original_price}
                    </span>
                  )}
                  <span className="font-semibold">
                    {selectedPrice.calculated_price}
                  </span>
                </span>
              )}
            </div>
            <div
              className={clx("grid grid-cols-2 w-full gap-x-3", {
                "!grid-cols-1": isSimple,
              })}
            >
              {!isSimple && (
                <Button
                  onClick={open}
                  variant="secondary"
                  fullWidth
                  className="px-3"
                  aria-haspopup="dialog"
                  data-testid="mobile-actions-button"
                >
                  <span className="truncate">
                    {optionSummaryLabel(product.options, options)}
                  </span>
                  <ChevronDown aria-hidden="true" />
                </Button>
              )}
              <Button
                onClick={handleAddToCart}
                disabled={addToCartState.disabled}
                fullWidth
                className="px-3"
                isLoading={isAdding}
                loadingText="Adding…"
                data-testid="mobile-cart-button"
              >
                {addToCartState.label}
              </Button>
            </div>
          </div>
        </Transition>
      </div>

      <Dialog open={state} onClose={close} className="relative z-[75]">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-brand-ink/50 transition-opacity duration-200 ease-out data-[closed]:opacity-0"
        />
        <div className="fixed inset-x-0 bottom-0">
          <DialogPanel
            transition
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-sheet bg-brand-surface px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-left transition-transform duration-200 ease-out data-[closed]:translate-y-full"
            data-testid="mobile-actions-modal"
          >
            <div className="flex items-center justify-between">
              <DialogTitle className="type-h3 text-brand-ink">
                {product.title}
              </DialogTitle>
              <button
                onClick={close}
                className="flex h-11 w-11 items-center justify-center rounded-control text-brand-ink hover:bg-brand-surface-alt"
                aria-label="Close"
                data-testid="close-modal-button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {(product.variants?.length ?? 0) > 1 && (
              <div className="flex flex-col gap-y-6 pt-2">
                {(product.options || []).map((option) => {
                  return (
                    <div key={option.id}>
                      <OptionSelect
                        option={option}
                        current={options[option.id]}
                        updateOption={updateOptions}
                        title={option.title ?? ""}
                        disabled={optionsDisabled}
                        unavailable={unavailableValues}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}

export default MobileActions
