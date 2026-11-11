// The storefront's port, from the environment variable STOREFRONT_PORT
// (default 8000). Plain logic, unit tested in src/__tests__/storefront-port.test.ts;
// ./next-with-port.mjs uses it to start `next dev` and `next start`.

export const DEFAULT_STOREFRONT_PORT = 8000

/**
 * The port to listen on. Unset or blank means the default. Anything else must
 * be a whole number from 1 to 65535, written in digits only.
 *
 * @param {string | undefined} value the raw value of STOREFRONT_PORT
 * @returns {{ ok: true, port: number } | { ok: false, error: string }}
 */
export function parseStorefrontPort(value) {
  if (value === undefined || value.trim() === "") {
    return { ok: true, port: DEFAULT_STOREFRONT_PORT }
  }

  const text = value.trim()
  const port = /^\d+$/.test(text) ? Number(text) : NaN

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      error:
        `STOREFRONT_PORT must be a whole number from 1 to 65535, but it is "${value}". ` +
        `Set it to a free port (for example STOREFRONT_PORT=8006) or leave it unset for ${DEFAULT_STOREFRONT_PORT}.`,
    }
  }

  return { ok: true, port }
}
