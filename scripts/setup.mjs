#!/usr/bin/env node
// `npm run setup`: prepare a fresh checkout for development. Safe to run again.
//
//   1. create missing .env files from the .env.example files
//   2. check that PostgreSQL (and Redis, when REDIS_URL is set) is reachable
//   3. run the database migrations
//   4. seed the placeholder store data and the local admin user
//   5. write the publishable API key into storefront/.env.local (skipped if storefront/ is missing)
//
// Cross-platform: plain Node, no bash. It prints the admin email, never the password.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPublishableKey, parseEnv, upsertEnvVar } from "./lib/env-file.mjs";
import { adminLoginMessage, servicesToCheck, unreachableMessage } from "./lib/setup-checks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = (message) => console.log(`[setup] ${message}`);
const warn = (message) => console.warn(`[setup] WARNING: ${message}`);

function fail(message) {
  console.error(`[setup] ERROR: ${message}`);
  process.exit(1);
}

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

/** Run a shell command in `cwd`, echo its output, and resolve with { code, output }. */
function run(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, stdio: ["inherit", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

function canConnect(host, port, timeoutMs = 3000) {
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

async function main() {
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
  // from the shell wins here too.
  const backendEnv = { ...parseEnv(readFileSync(backendEnvPath, "utf8")) };
  for (const name of ["DATABASE_URL", "REDIS_URL", "MEDUSA_ADMIN_EMAIL", "MEDUSA_ADMIN_PASSWORD"]) {
    if (process.env[name] !== undefined) backendEnv[name] = process.env[name];
  }

  // 2. PostgreSQL (and Redis, when REDIS_URL is set) reachable?
  const { services, problems } = servicesToCheck(backendEnv);
  if (problems.length > 0) fail(problems.join("\n"));
  for (const service of services) {
    if (!(await canConnect(service.host, service.port))) fail(unreachableMessage(service));
  }

  // 3. Migrations
  log("running database migrations");
  const migrate = await run("npm run migrate --workspace backend", root);
  if (migrate.code !== 0) fail("migrations failed");

  // 4. Seed
  log("seeding placeholder data (only creates what is missing)");
  const seed = await run("npm run seed --workspace backend", root);
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
}

main().catch((error) => fail(error?.stack ?? String(error)));
