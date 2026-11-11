#!/usr/bin/env node
// Runs `next <command> [args…] -p <port>` with the port taken from the
// environment variable STOREFRONT_PORT (default 8000), so a second checkout
// can run next to the first. Used by the `dev` and `start` scripts in
// ../package.json:
//
//   node scripts/next-with-port.mjs dev --turbopack
//   node scripts/next-with-port.mjs start
//
// Set the variable in the shell that starts the storefront; this wrapper does
// not read .env files (Next.js reads .env.local only after the port is chosen):
//
//   Git Bash:    STOREFRONT_PORT=8006 npm run dev
//   PowerShell:  $env:STOREFRONT_PORT = "8006"; npm run dev
//   cmd:         set STOREFRONT_PORT=8006 && npm run dev
//
// An invalid value stops with a message before Next.js starts. Plain Node, no
// shell syntax, so it works the same in all three.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"

import { parseStorefrontPort } from "./storefront-port.mjs"

const parsed = parseStorefrontPort(process.env.STOREFRONT_PORT)
if (!parsed.ok) {
  console.error(`[storefront] ${parsed.error}`)
  process.exit(1)
}

const [command, ...args] = process.argv.slice(2)
if (command !== "dev" && command !== "start") {
  console.error('[storefront] Usage: node scripts/next-with-port.mjs <dev|start> [next options]')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const nextBin = require.resolve("next/dist/bin/next")

const child = spawn(
  process.execPath,
  [nextBin, command, ...args, "-p", String(parsed.port)],
  { stdio: "inherit" }
)

// Pass a stop signal on to Next.js; on Windows Ctrl+C reaches both anyway.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal)
  })
}

child.on("error", (error) => {
  console.error(`[storefront] Could not start Next.js: ${error.message}`)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
