/**
 * The public addresses the backend writes into links it sends (the password-reset link today):
 * `STOREFRONT_URL`, where customers open the store, and `BACKEND_URL`, where this backend and its
 * admin (`/app`) are reached from outside. Read and validated here and nowhere else: the start
 * checks in build-config.ts and the password-reset subscriber both call this module.
 * Plain TypeScript, no Medusa imports.
 *
 * Each must be a bare origin: `http(s)://host[:port]`, nothing after it but an optional `/`. A path
 * would be dropped or doubled when a page path is added to it, a query or fragment would end up in
 * the middle of every link, and a user or password would be sent to every customer who gets a link.
 * Development and test fall back to the addresses in backend/.env.example when a value is unset;
 * every other NODE_ENV (node-env.ts) needs both set, with `https`. A value is never echoed in a
 * message (it may hold credentials).
 */
import type { Env } from "./build-config"
import { isLocalNodeEnv } from "./node-env"

export type PublicUrlName = "STOREFRONT_URL" | "BACKEND_URL"

/** The development defaults, the same as in backend/.env.example (a unit test compares them). */
export const PUBLIC_URL_DEFAULTS: Readonly<Record<PublicUrlName, string>> = {
  STOREFRONT_URL: "http://localhost:8000",
  BACKEND_URL: "http://localhost:9000",
}

/** What each address is, for the messages. */
const WHAT: Readonly<Record<PublicUrlName, { what: string; example: string }>> = {
  STOREFRONT_URL: {
    what: "the storefront's public address, where customers open the store",
    example: "https://shop.example.com",
  },
  BACKEND_URL: {
    what: "this backend's public address, where the admin is opened at /app",
    example: "https://api.example.com",
  },
}

export type PublicUrls = {
  /** STOREFRONT_URL as an origin, without a trailing slash. */
  storefrontUrl: string
  /** BACKEND_URL as an origin, without a trailing slash. */
  backendUrl: string
}

/** A refused value, the way the existing start checks phrase them: what is wrong, then what to write. */
export class PublicUrlError extends Error {}

function writeAs(name: PublicUrlName, production: boolean): string {
  const { example } = WHAT[name]
  return production
    ? `Write ${WHAT[name].what}, as https://<host> with nothing after it, for example ${example}`
    : `Write it as http(s)://<host>[:<port>] with nothing after it, for example ${PUBLIC_URL_DEFAULTS[name]}`
}

/**
 * Why `raw` cannot be used as `name`, or undefined when it can. `production` is true for every
 * NODE_ENV other than unset, development and test.
 */
export function publicUrlProblem(
  name: PublicUrlName,
  raw: string | undefined,
  production: boolean
): string | undefined {
  const value = raw?.trim()
  if (!value) {
    return production ? `${name} is not set. ${writeAs(name, production)}` : undefined
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return `${name} is not a URL. ${writeAs(name, production)}`
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `${name} must start with https:// (or http:// in development). ${writeAs(name, production)}`
  }
  if (production && url.protocol !== "https:") {
    return `${name} must use https outside development and test. ${writeAs(name, production)}`
  }
  if (!url.hostname) {
    return `${name} names no host. ${writeAs(name, production)}`
  }
  if (url.username || url.password) {
    return `${name} must not contain a user name or password, because it is written into links sent to customers. ${writeAs(name, production)}`
  }
  if (url.pathname !== "/") {
    return `${name} must not have a path (the pages' paths are added to it). ${writeAs(name, production)}`
  }
  // A bare `?` or `#` leaves url.search and url.hash empty, so the text is checked as well.
  if (url.search || url.hash || /[?#]/.test(value)) {
    return `${name} must not have a query (?...) or fragment (#...). ${writeAs(name, production)}`
  }
  return undefined
}

function production(env: Env): boolean {
  return !isLocalNodeEnv(env.NODE_ENV)
}

/** Every problem with STOREFRONT_URL and BACKEND_URL for this environment; empty when both are usable. */
export function publicUrlProblems(env: Env): string[] {
  const names: PublicUrlName[] = ["STOREFRONT_URL", "BACKEND_URL"]
  return names
    .map((name) => publicUrlProblem(name, env[name], production(env)))
    .filter((problem): problem is string => problem !== undefined)
}

function origin(name: PublicUrlName, env: Env): string {
  const value = env[name]?.trim()
  return new URL(value ? value : PUBLIC_URL_DEFAULTS[name]).origin
}

/**
 * STOREFRONT_URL and BACKEND_URL as origins (`https://shop.example.com`, no trailing slash), with
 * the development defaults when unset in development and test. Throws PublicUrlError listing every
 * problem otherwise.
 */
export function readPublicUrls(env: Env): PublicUrls {
  const problems = publicUrlProblems(env)
  if (problems.length > 0) {
    throw new PublicUrlError(problems.join("\n"))
  }
  return { storefrontUrl: origin("STOREFRONT_URL", env), backendUrl: origin("BACKEND_URL", env) }
}
