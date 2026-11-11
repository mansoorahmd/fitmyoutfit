/**
 * Ids of the cash-on-delivery payment provider. No imports, so plain code and tests can use them.
 * Medusa registers a payment provider as `pp_<identifier>_<id>`.
 */

/** The provider class's static `identifier`. */
export const COD_PROVIDER_IDENTIFIER = "cod"

/** The `id` given to the provider in the payment module's options (lib/config/build-config.ts). */
export const COD_PROVIDER_CONFIG_ID = "cod"

/** The provider id regions, payment sessions and the storefront use. */
export const COD_PAYMENT_PROVIDER_ID = `pp_${COD_PROVIDER_IDENTIFIER}_${COD_PROVIDER_CONFIG_ID}`
