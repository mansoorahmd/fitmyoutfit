"use client"

import { productContent } from "@content/product"
import { addToCart } from "@lib/data/cart"
import {
  getAddToCartState,
  getUnavailableOptionValues,
  needsVariantSelection,
} from "@lib/util/add-to-cart-state"
import { getProductPrice } from "@lib/util/get-product-price"
import {
  chosenLabel,
  isFullyInView,
  stickyBarSummary,
} from "@lib/util/sticky-buy-bar"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/button"
import OptionSelect from "@modules/products/components/product-actions/option-select"
import { isEqual } from "lodash"
import { useParams, usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import ProductPrice from "../product-price"
import StickyBuyBar, { useStickyBuyBar } from "./sticky-buy-bar"
import { useRouter } from "next/navigation"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt: any) => {
    acc[varopt.option_id] = varopt.value
    return acc
  }, {})
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The buy block (docs/design/03-direction.md, "Product page"): the price
 * block, the size selector and the main button, plus the phone's sticky
 * buy bar. Pressing either button with no size chosen shows "Choose a size"
 * at the size selector and moves focus there; it never sits disabled.
 */
export default function ProductActions({
  product,
  region,
  disabled,
}: ProductActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // A single-variant product needs no choice, so it starts preselected
  const [options, setOptions] = useState<Record<string, string | undefined>>(
    () =>
      product.variants?.length === 1
        ? optionsAsKeymap(product.variants[0].options) ?? {}
        : {}
  )
  const [isAdding, setIsAdding] = useState(false)
  const [sizeErrorShown, setSizeErrorShown] = useState(false)
  const countryCode = useParams().countryCode as string

  // If there is only 1 variant, preselect the options
  useEffect(() => {
    if (product.variants?.length === 1) {
      const variantOptions = optionsAsKeymap(product.variants[0].options)
      setOptions(variantOptions ?? {})
    }
  }, [product.variants])

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) {
      return
    }

    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  // update the options when a variant is selected
  const setOptionValue = (optionId: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [optionId]: value,
    }))
  }

  //check if the selected options produce a valid variant
  const isValidVariant = useMemo(() => {
    return product.variants?.some((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const value = isValidVariant ? selectedVariant?.id : null

    if (params.get("v_id") === value) {
      return
    }

    if (value) {
      params.set("v_id", value)
    } else {
      params.delete("v_id")
    }

    // Recording the chosen variant in the URL must not move the page. The
    // default scrolls to the top, which lost the visitor's place on a phone.
    router.replace(pathname + "?" + params.toString(), { scroll: false })
  }, [selectedVariant, isValidVariant])

  // label and state of the main button, shared with the sticky bar
  const needsSelection = needsVariantSelection(product, options)
  const addToCartState = getAddToCartState({
    variant: selectedVariant,
    isValidVariant,
    needsSelection,
  })
  // The message clears itself once every option has a value.
  const sizeError =
    sizeErrorShown && needsSelection ? productContent.size.error : undefined

  const mainButtonRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const showStickyBar = useStickyBuyBar(mainButtonRef)

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)

    try {
      await addToCart({
        variantId: selectedVariant.id,
        quantity: 1,
        countryCode,
      })
    } finally {
      // never leave the button stuck on "Adding…"
      setIsAdding(false)
    }
  }

  // No size yet: show the message and take the customer to the first
  // option without a value. It is scrolled into view only when it is not
  // already wholly on screen (from the sticky bar it never is).
  const askForSize = () => {
    setSizeErrorShown(true)

    const missing = (product.options ?? []).find((o) => !options[o.id])
    const group = missing ? groupRefs.current[missing.id] : null
    if (!group) {
      return
    }

    const header = document.querySelector("header")
    const headerBottom = header
      ? Math.max(0, header.getBoundingClientRect().bottom)
      : 0
    const inView = isFullyInView(
      group.getBoundingClientRect(),
      headerBottom,
      window.innerHeight
    )
    if (!inView && typeof group.scrollIntoView === "function") {
      group.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      })
    }
    group.focus({ preventScroll: true })
  }

  const handlePress = () => {
    if (addToCartState.asksForSize) {
      askForSize()
      return
    }
    handleAddToCart()
  }

  const unavailableValues = useMemo(
    () => getUnavailableOptionValues(product),
    [product]
  )

  const hasChoice = (product.variants?.length ?? 0) > 1

  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: selectedVariant?.id,
  })
  const barPrice = (selectedVariant ? variantPrice : cheapestPrice)
    ?.calculated_price
  const barSummary = stickyBarSummary(
    chosenLabel(product.options, options, hasChoice),
    barPrice
  )

  const buttonDisabled = addToCartState.disabled || !!disabled

  return (
    <div className="flex flex-col gap-6">
      <ProductPrice
        product={product}
        variant={selectedVariant}
        region={region}
        countryCode={countryCode}
      />

      {hasChoice && (
        <div className="flex flex-col gap-y-6">
          {(product.options || []).map((option) => (
            <OptionSelect
              key={option.id}
              option={option}
              current={options[option.id]}
              updateOption={setOptionValue}
              title={option.title ?? ""}
              data-testid="product-options"
              disabled={!!disabled || isAdding}
              unavailable={unavailableValues}
              error={!options[option.id] ? sizeError : undefined}
              groupRef={(element) => {
                groupRefs.current[option.id] = element
              }}
            />
          ))}
        </div>
      )}

      <div ref={mainButtonRef}>
        <Button
          onClick={handlePress}
          disabled={buttonDisabled}
          variant="primary"
          fullWidth
          isLoading={isAdding}
          loadingText={productContent.button.adding}
          data-testid="add-product-button"
        >
          {addToCartState.label}
        </Button>
      </div>

      <StickyBuyBar
        show={showStickyBar}
        summary={barSummary}
        label={addToCartState.label}
        loadingLabel={productContent.button.adding}
        disabled={buttonDisabled}
        isLoading={isAdding}
        onPress={handlePress}
      />
    </div>
  )
}
