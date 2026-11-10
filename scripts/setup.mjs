#!/usr/bin/env node
// `npm run setup`: prepare a fresh checkout for development. Safe to run again.
//
//   1. create missing .env files from the .env.example files
//   2. check that PostgreSQL (and Redis, when REDIS_URL is set) is reachable
//   3. run the database migrations
//   4. seed the placeholder store data and the local admin user
//   5. write the publishable API key into storefront/.env.local (skipped if storefront/ is missing)
//
// Cross-platform: plain Node, no bash. It prints the admin email, never the password: setup's
// own messages never contain it, and the output of the migrations and the seed, which setup
// echoes, goes through a filter that hides it. `runSetup` takes its outputs and the commands it
// runs as arguments, so setup-output.test.mjs can run it with a known password and read
// everything it prints.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPublishableKey, parseEnv, upsertEnvVar } from "./lib/env-file.mjs";
import { createRedactor } from "./lib/redact.mjs";
import { adminLoginMessage, servicesToCheck, unreachableMessage } from "./lib/setup-checks.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Variables setup reads from backend/.env, where a value already set in the shell wins. */
const SHELL_OVERRIDES = ["DATABASE_URL", "REDIS_URL", "MEDUSA_ADMIN_EMAIL", "MEDUSA_ADMIN_PASSWORD"];

class SetupFailed extends Error {}

/**
 * Run a shell command in `cwd`. Its stdout and stderr are both piped (never inherited), and
 * each chunk is handed to `onStdout` / `onStderr`, so the caller decides what gets printed.
 * Resolves with the exit code.
 */
export function spawnCommand(command, cwd, { env = process.env, onStdout, onStderr }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, env, shell: true, stdio: ["inherit", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => onStdout(chunk));
    child.stderr.on("data", (chunk) => onStderr(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function tcpCanConnect(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * The whole setup. Returns the exit code (0 or 1) instead of exiting.
 * - `out` / `err`: where text goes (default: the process's stdout and stderr).
 * - `runCommand(command, cwd, { env, onStdout, onStderr })`: runs migrations and the seed.
 * - `canConnect(host, port)`: the reachability check.
 */
export async function runSetup({
  root = defaultRoot,
  env = process.env,
  out = (text) => process.stdout.write(text),
  err = (text) => process.stderr.write(text),
  runCommand = spawnCommand,
  canConnect = tcpCanConnect,
} = {}) {
  const log = (message) => out(`[setup] ${message}\n`);
  const warn = (message) => err(`[setup] WARNING: ${message}\n`);
  const fail = (message) => {
    throw new SetupFailed(message);
  };

  /** Copy `example` to `target` if `target` is missing. Returns true if the target exists afterwards. */
  function ensureEnvFile(target, example) {
    if (existsSync(target)) {
      log(`${path.relative(root, target)} already exists, leaving it as it is`);
      return true;
    }
    if (!existsSync(example)) {
      warn(`${path.relative(root, example)} is missing, cannot create ${path.relative(root, target)}`);
      return false;
    }
    copyFileSync(example, target);
    log(`created ${path.relative(root, target)} from ${path.basename(example)}`);
    return true;
  }

  try {
    // 1. Env files
    ensureEnvFile(path.join(root, ".env"), path.join(root, ".env.example"));
    const backendDir = path.join(root, "backend");
    const backendEnvPath = path.join(backendDir, ".env");
    if (!ensureEnvFile(backendEnvPath, path.join(backendDir, ".env.example"))) {
      fail("backend/.env could not be created");
    }
    const storefrontDir = path.join(root, "storefront");
    const hasStorefront = existsSync(storefrontDir);
    const storefrontEnvPath = path.join(storefrontDir, ".env.local");
    if (hasStorefront) {
      ensureEnvFile(storefrontEnvPath, path.join(storefrontDir, ".env.example"));
    } else {
      warn("storefront/ does not exist yet: skipping storefront/.env.local");
    }

    // Medusa loads backend/.env without overriding variables already set in the shell, so a value
    // from the shell wins here too. `sources` records where each value came from, for messages.
    const backendEnv = { ...parseEnv(readFileSync(backendEnvPath, "utf8")) };
    const sources = {};
    for (const name of SHELL_OVERRIDES) {
      if (env[name] !== undefined) {
        backendEnv[name] = env[name];
        sources[name] = "your shell environment";
      } else if (backendEnv[name] !== undefined) {
        sources[name] = "backend/.env";
      }
    }

    // Everything the migrations and the seed print goes through this filter before it is echoed.
    const secrets = [backendEnv.MEDUSA_ADMIN_PASSWORD];
    const run = async (command) => {
      const stdout = createRedactor(secrets);
      const stderr = createRedactor(secrets);
      let output = "";
      const code = await runCommand(command, root, {
        env,
        onStdout: (chunk) => {
          output += chunk;
          out(stdout.push(chunk));
        },
        onStderr: (chunk) => err(stderr.push(chunk)),
      });
      out(stdout.flush());
      err(stderr.flush());
      return { code, output };
    };

    // 2. PostgreSQL (and Redis, when REDIS_URL is set) reachable?
    const { services, problems } = servicesToCheck(backendEnv, sources);
    if (problems.length > 0) fail(problems.join("\n"));
    for (const service of services) {
      if (!(await canConnect(service.host, service.port))) fail(unreachableMessage(service));
    }

    // 3. Migrations
    log("running database migrations");
    const migrate = await run("npm run migrate --workspace backend");
    if (migrate.code !== 0) fail("migrations failed");

    // 4. Seed
    log("seeding placeholder data (only creates what is missing)");
    const seed = await run("npm run seed --workspace backend");
    if (seed.code !== 0) fail("seed failed");
    const publishableKey = extractPublishableKey(seed.output);
    if (!publishableKey) fail("the seed did not print a publishable key");

    // 5. Storefront key
    if (hasStorefront) {
      const current = existsSync(storefrontEnvPath) ? readFileSync(storefrontEnvPath, "utf8") : "";
      const { content, changed } = upsertEnvVar(
        current,
        "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
        publishableKey,
      );
      if (changed) {
        writeFileSync(storefrontEnvPath, content);
        log("wrote NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY into storefront/.env.local");
      } else {
        log("storefront/.env.local already has the current publishable key");
      }
    }

    log("done.");
    log(`Publishable API key: ${publishableKey}`);
    log(adminLoginMessage(backendEnv));
    log("Next: npm run dev");
    return 0;
  } catch (error) {
    const message = error instanceof SetupFailed ? error.message : (error?.stack ?? String(error));
    err(`[setup] ERROR: ${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisPath = fileURLToPath(import.meta.url);
const isMain =
  process.platform === "win32"
    ? invokedPath.toLowerCase() === thisPath.toLowerCase()
    : invokedPath === thisPath;
if (isMain) {
  process.exitCode = await runSetup();
}
