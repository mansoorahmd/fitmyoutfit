"use client"

import { cartContent } from "@content/cart"
import { FIT_KIT_HANDLE, productContent } from "@content/product"
import { addToCartAndConfirm } from "@lib/data/cart"
import { showsSnackbar } from "@lib/util/added-to-cart"
import {
  getAddToCartState,
  getUnavailableOptionValues,
  needsVariantSelection,
} from "@lib/util/add-to-cart-state"
import { amountFor } from "@lib/util/cart-view"
import { convertToLocale } from "@lib/util/money"
import { getProductPrice } from "@lib/util/get-product-price"
import { productKind } from "@lib/util/product-kind"
import { productMinimumLine } from "@lib/util/product-minimum"
import { maxQuantityFor } from "@lib/util/quantity"
import { parseSizeChart } from "@lib/util/size-chart"
import { isSizeOption } from "@lib/util/sizes"
import {
  chosenLabel,
  chosenWithQuantity,
  isFullyInView,
  stickyBarSummary,
} from "@lib/util/sticky-buy-bar"
import { fill } from "@lib/util/wording"
import { HttpTypes } from "@medusajs/types"
import AddedToCart from "@modules/cart/components/added-to-cart"
import {
  AddSource,
  useAddedToCart,
} from "@modules/cart/components/added-to-cart/context"
import AddedSnackbar from "@modules/cart/components/added-to-cart/snackbar"
import Alert from "@modules/common/components/alert"
import { Button } from "@modules/common/components/button"
import QuantityStepper from "@modules/common/components/quantity-stepper"
import LineIcon from "@modules/home/components/line-icon"
import OptionSelect from "@modules/products/components/product-actions/option-select"
import { SizeChartBody, SizeChartSheet } from "@modules/products/components/size-chart"
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
  /**
   * Garment pieces already in the cart, from the backend's rules, for "You
   * have 4 in your cart." Null without a cart or rules.
   */
  initialCounted?: number | null
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
 * The buy block (docs/design/03-direction.md, "Product page", and
 * 05-m1-pages.md, 3.3 and 4.7 to 5.2): the price block with the minimum
 * line in export regions, the size selector with its "Size chart" link, the
 * quantity stepper beside the main button, the "Added to your cart"
 * confirmation, and the phone's sticky buy bar. Pressing either button with
 * no size chosen shows "Choose a size" at the size selector and moves focus
 * there; it never sits disabled.
 */
export default function ProductActions({
  product,
  region,
  disabled,
  initialCounted = null,
}: ProductActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { added, show, dismiss } = useAddedToCart()

  // A single-variant product needs no choice, so it starts preselected
  const [options, setOptions] = useState<Record<string, string | undefined>>(
    () =>
      product.variants?.length === 1
        ? optionsAsKeymap(product.variants[0].options) ?? {}
        : {}
  )
  const [isAdding, setIsAdding] = useState(false)
  const [sizeErrorShown, setSizeErrorShown] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [addFailed, setAddFailed] = useState(false)
  const [counted, setCounted] = useState<number | null>(initialCounted)
  const [chartOpen, setChartOpen] = useState(false)
  const [snackbarShown, setSnackbarShown] = useState(false)
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
  const inlineRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const showStickyBar = useStickyBuyBar(mainButtonRef)

  const kind = productKind(product)
  const hasQuantity = kind === "garment" || kind === "fit_kit"
  const maxQuantity = maxQuantityFor(selectedVariant)
  const chart = useMemo(() => parseSizeChart(product.metadata), [product.metadata])
  const isFitKit = kind === "fit_kit" || product.handle === FIT_KIT_HANDLE

  // add the selected variant to the cart
  const handleAddToCart = async (source: AddSource) => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)
    setAddFailed(false)

    try {
      const result = await addToCartAndConfirm({
        variantId: selectedVariant.id,
        quantity: hasQuantity ? quantity : 1,
        countryCode,
      })
      if (!result.ok) {
        dismiss()
        setAddFailed(true)
        return
      }
      if (result.added) {
        show(result.added, source)
        setSnackbarShown(source === "sticky-bar")
        if (result.added.counted !== null) {
          setCounted(result.added.counted)
        }
      }
    } catch {
      dismiss()
      setAddFailed(true)
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

  const pressFrom = (source: AddSource) => () => {
    if (addToCartState.asksForSize) {
      askForSize()
      return
    }
    handleAddToCart(source)
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
  const shownPrice = selectedVariant ? variantPrice : cheapestPrice
  // "M × 4 · PKR 14,000" once more than one piece is chosen (05, 4.8)
  const barPrice =
    selectedVariant && variantPrice && quantity > 1
      ? convertToLocale({
          amount: amountFor(variantPrice.calculated_price_number, quantity),
          currency_code: variantPrice.currency_code,
        })
      : shownPrice?.calculated_price
  const barSummary = stickyBarSummary(
    chosenWithQuantity(
      chosenLabel(product.options, options, hasChoice),
      quantity,
      (chosen, count) =>
        fill(productContent.stickyBar.quantity, { chosen, quantity: count })
    ),
    barPrice
  )

  const buttonDisabled = addToCartState.disabled || !!disabled

  const minimumLine = productMinimumLine({
    show: productContent.minimum.show,
    countryCode,
    product,
    region,
    counted,
  })

  const sizeOptionId = product.options?.find((o) => isSizeOption(o.title))?.id
  const chosenSize = sizeOptionId ? options[sizeOptionId] : undefined

  const inline = added?.placement === "inline" ? added : null
  const snackbar =
    inline && snackbarShown && showsSnackbar(inline.placement, inline.source)
      ? inline
      : null

  // The snackbar goes once the inline confirmation is scrolled into view.
  useEffect(() => {
    const box = inlineRef.current
    if (!snackbar || !box || typeof IntersectionObserver !== "function") {
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSnackbarShown(false)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [snackbar])

  const sizeChartLink = chart ? (
    <button
      type="button"
      onClick={() => setChartOpen(true)}
      aria-haspopup="dialog"
      className="inline-flex min-h-[44px] items-center gap-1.5 px-1 type-small font-semibold text-brand-ink underline decoration-1 underline-offset-4 hover:decoration-2"
      data-testid="size-chart-link"
    >
      <LineIcon name="ruler" className="h-5 w-5" />
      {productContent.sizeChart.title}
    </button>
  ) : null

  const mainButton = (
    <Button
      onClick={pressFrom("main")}
      disabled={buttonDisabled}
      variant="primary"
      fullWidth
      isLoading={isAdding}
      loadingText={productContent.button.adding}
      className={hasQuantity ? "min-w-[176px] flex-1" : undefined}
      data-testid="add-product-button"
    >
      {addToCartState.label}
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <ProductPrice
        product={product}
        variant={selectedVariant}
        region={region}
        countryCode={countryCode}
        minimum={
          minimumLine && (
            <div className="flex flex-col gap-0.5" data-testid="minimum-line">
              <p className="flex items-center gap-2 type-small font-semibold text-brand-ink">
                <LineIcon name="team" className="h-5 w-5 shrink-0" />
                {fill(productContent.minimum.line, { n: minimumLine.required })}
              </p>
              {minimumLine.counted !== null && (
                <p className="pl-7 type-small text-brand-ink" data-testid="minimum-in-cart">
                  {fill(productContent.minimum.inCart, { counted: minimumLine.counted })}
                </p>
              )}
            </div>
          )
        }
      />

      {isFitKit && chart && (
        <section className="flex flex-col gap-3" data-testid="fit-kit-sizes">
          <h2 className="type-h3 text-brand-ink">{productContent.sizeChart.kitTitle}</h2>
          <SizeChartBody chart={chart} productTitle={product.title} showFitKitLink={false} />
        </section>
      )}

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
              labelAction={option.id === sizeOptionId ? sizeChartLink : undefined}
              groupRef={(element) => {
                groupRefs.current[option.id] = element
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div ref={mainButtonRef}>
          {hasQuantity ? (
            <div className="flex items-start gap-3">
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={maxQuantity}
                label={
                  chosenSize
                    ? fill(cartContent.line.quantityLabel, { title: product.title, size: chosenSize })
                    : fill(cartContent.line.quantityLabelNoSize, { title: product.title })
                }
                decreaseLabel={cartContent.line.decrease}
                increaseLabel={cartContent.line.increase}
                rangeMessage={fill(cartContent.line.quantityRange, { max: maxQuantity })}
                className="shrink-0"
              />
              {mainButton}
            </div>
          ) : (
            mainButton
          )}
        </div>

        {addFailed && (
          <Alert variant="error" announce focusOnMount data-testid="add-error">
            {cartContent.added.error}
          </Alert>
        )}

        {inline && (
          <div ref={inlineRef}>
            <AddedToCart
              key={inline.view.key}
              view={inline.view}
              variant="inline"
              onClose={dismiss}
            />
          </div>
        )}
      </div>

      <StickyBuyBar
        show={showStickyBar}
        summary={barSummary}
        label={addToCartState.label}
        loadingLabel={productContent.button.adding}
        disabled={buttonDisabled}
        isLoading={isAdding}
        onPress={pressFrom("sticky-bar")}
      />

      {snackbar && (
        <AddedSnackbar view={snackbar.view} onClose={() => setSnackbarShown(false)} />
      )}

      {chart && !isFitKit && (
        <SizeChartSheet
          open={chartOpen}
          onClose={() => setChartOpen(false)}
          chart={chart}
          productTitle={product.title}
          chosenSize={chosenSize}
          showFitKitLink={!isFitKit}
        />
      )}
    </div>
  )
}
