import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ADMIN_REFERRER_POLICY,
  ADMIN_RESET_FRAGMENT_SCRIPT,
  adminHeadTags,
  adminResetPagePlugin,
  buildAdminConfig,
} from "../admin-page"
import { buildMedusaConfig } from "../build-config"

/** Runs the script in a fake window at `address`; returns the address afterwards and the calls. */
function runScript(address: string) {
  const url = new URL(address)
  const calls: unknown[][] = []
  const window = {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: {
      state: { idx: 0 },
      replaceState: (...args: unknown[]) => calls.push(args),
    },
  }
  new Function("window", ADMIN_RESET_FRAGMENT_SCRIPT)(window)
  return calls
}

describe("the script that moves the admin reset link's fragment into the query", () => {
  it("turns #token=…&email=… into ?token=…&email=… on the reset page, without a request", () => {
    const calls = runScript("https://api.example.com/app/reset-password#token=a.b.c&email=a%40b.co")
    expect(calls).toEqual([[{ idx: 0 }, "", "/app/reset-password?token=a.b.c&email=a%40b.co"]])
  })

  it("also with a trailing slash", () => {
    const calls = runScript("https://api.example.com/app/reset-password/#token=a.b.c")
    expect(calls).toEqual([[{ idx: 0 }, "", "/app/reset-password/?token=a.b.c"]])
  })

  it.each([
    ["another page", "https://api.example.com/app/orders#token=a.b.c"],
    ["the page with a query already", "https://api.example.com/app/reset-password?token=x#token=a.b.c"],
    ["a fragment without the token first", "https://api.example.com/app/reset-password#email=a&token=b"],
    ["no fragment", "https://api.example.com/app/reset-password"],
    ["a longer path", "https://api.example.com/app/reset-password/x#token=a.b.c"],
  ])("does nothing on %s", (_name, address) => {
    expect(runScript(address)).toEqual([])
  })
})

describe("the admin's head tags", () => {
  it("are the referrer policy and the script, first in the head", () => {
    expect(ADMIN_REFERRER_POLICY).toBe("strict-origin")
    expect(adminHeadTags()).toEqual([
      { tag: "meta", attrs: { name: "referrer", content: "strict-origin" }, injectTo: "head-prepend" },
      { tag: "script", children: ADMIN_RESET_FRAGMENT_SCRIPT, injectTo: "head-prepend" },
    ])
    const plugin = adminResetPagePlugin()
    expect(plugin.name).toBe("fitmyoutfit:admin-reset-page")
    expect(plugin.transformIndexHtml()).toEqual(adminHeadTags())
  })

  it("reach Medusa through the admin.vite option of the configuration", () => {
    const config = buildMedusaConfig({ NODE_ENV: "test" }) as { admin?: { vite?: (c: unknown) => any } }
    const extra = config.admin?.vite?.({})
    expect(extra.plugins.map((p: { name: string }) => p.name)).toEqual(["fitmyoutfit:admin-reset-page"])
    expect(buildAdminConfig().vite({}).plugins[0].transformIndexHtml()).toEqual(adminHeadTags())
  })

  it("rely on Medusa's admin build merging admin.vite into its Vite configuration", () => {
    const bundler = readFileSync(
      join(__dirname, "..", "..", "..", "..", "node_modules/@medusajs/admin-bundler/dist/index.js"),
      "utf8"
    )
    expect(bundler).toContain("const customConfig = options.vite(baseConfig);")
    expect(bundler).toContain("finalConfig = mergeConfig(baseConfig, customConfig);")
  })
})
