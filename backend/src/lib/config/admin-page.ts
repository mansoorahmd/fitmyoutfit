/**
 * Keeps the admin's reset token away from every request the server sees (QA's fifteenth review,
 * B2). Plain TypeScript, no Medusa imports; build-config.ts hands it to Medusa through the
 * documented `admin.vite` option, which extends the Vite configuration of Medusa's admin build
 * (`medusa build`) and of its development server (`medusa develop`).
 *
 * Medusa's request log (@medusajs/framework 2.22.6, http/express-loader.js) writes the address and
 * the `Referer` of every request, and Medusa registers its admin before the routes and middlewares
 * of this project, so no middleware of ours runs for `/app/...` requests. Instead:
 *
 * 1. The admin's link carries the token in the fragment: `/app/reset-password#token=…&email=…`
 *    (lib/rules/password-reset.ts). A browser never sends a fragment to a server, nor in a
 *    `Referer`, so the page request is logged without it (here and in any proxy's log).
 * 2. A small script in the head of the admin's index.html, run before the admin's own code, moves
 *    `#token=…&email=…` into the query (`?token=…&email=…`) with history.replaceState, which makes
 *    no request. Medusa's reset page reads `token` from the query as before.
 * 3. A `<meta name="referrer" content="strict-origin">` in the same head: every request the admin's
 *    pages make (scripts, styles, API calls) carries at most the origin as its `Referer`, never the
 *    path or query, so the token is not in the referrer either.
 */
import { ADMIN_RESET_PAGE } from "../rules/password-reset"

/** The admin pages' referrer policy: the origin only, and nothing from https to http. */
export const ADMIN_REFERRER_POLICY = "strict-origin"

/**
 * The script that moves the admin reset link's fragment into the query. It acts only on the
 * reset page, only when the address has no query and the fragment starts with `#token=`.
 */
export const ADMIN_RESET_FRAGMENT_SCRIPT =
  "(function () {" +
  " var l = window.location;" +
  ` if (l.pathname.replace(/\\/+$/, "") !== ${JSON.stringify(ADMIN_RESET_PAGE)} || l.search || l.hash.indexOf("#token=") !== 0) return;` +
  ' window.history.replaceState(window.history.state, "", l.pathname + "?" + l.hash.slice(1));' +
  " })();"

/** The subset of Vite's HtmlTagDescriptor used here. */
export type HtmlTag = {
  tag: string
  attrs?: Record<string, string>
  children?: string
  injectTo: "head-prepend"
}

/** The subset of a Vite plugin used here. */
export type AdminHtmlPlugin = { name: string; transformIndexHtml: () => HtmlTag[] }

/** The tags put first in the head of the admin's index.html. */
export function adminHeadTags(): HtmlTag[] {
  return [
    { tag: "meta", attrs: { name: "referrer", content: ADMIN_REFERRER_POLICY }, injectTo: "head-prepend" },
    { tag: "script", children: ADMIN_RESET_FRAGMENT_SCRIPT, injectTo: "head-prepend" },
  ]
}

/** The Vite plugin that adds adminHeadTags to the admin's index.html. */
export function adminResetPagePlugin(): AdminHtmlPlugin {
  return { name: "fitmyoutfit:admin-reset-page", transformIndexHtml: () => adminHeadTags() }
}

/**
 * The `admin` part of Medusa's configuration: only the `vite` extension above. Medusa merges the
 * returned configuration into its own (Vite's mergeConfig, so the plugin is added to Medusa's).
 */
export function buildAdminConfig(): { vite: (config: unknown) => { plugins: AdminHtmlPlugin[] } } {
  return { vite: () => ({ plugins: [adminResetPagePlugin()] }) }
}
