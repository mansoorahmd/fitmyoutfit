// What `npm run setup` prints must never contain the admin password (setup output ends up in
// terminals, logs and screenshots). These tests run the real setup flow (runSetup in setup.mjs)
// in a throwaway folder with a known password, with fake migrations and seed that print the
// password themselves, and check every character setup writes to stdout and stderr.
// Three tests run setup.mjs as a real child process and read the process's whole stdout and
// stderr, so a print that does not go through `out` / `err` (a stray console.log) fails too: the
// success path, the path without storefront/, and a failing migration.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REDACTED } from "./lib/redact.mjs";
import { runSetup, spawnCommand } from "./setup.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const PASSWORD = "Known-Test-Pass-4711";
const SHELL_PASSWORD = "Shell-Only-Pass-0815";
const EMAIL = "admin@example.test";

/** A checkout with only the .env.example files setup copies. */
function makeCheckout(password = PASSWORD) {
  const root = mkdtempSync(path.join(os.tmpdir(), "fmo-setup-test-"));
  mkdirSync(path.join(root, "backend"));
  mkdirSync(path.join(root, "storefront"));
  writeFileSync(path.join(root, ".env.example"), "POSTGRES_PORT=5433\n");
  writeFileSync(
    path.join(root, "backend", ".env.example"),
    [
      "DATABASE_URL=postgres://u:p@localhost:5433/db",
      `MEDUSA_ADMIN_EMAIL=${EMAIL}`,
      `MEDUSA_ADMIN_PASSWORD=${password}`,
      "",
    ].join("\n"),
  );
  writeFileSync(path.join(root, "storefront", ".env.example"), "NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000\n");
  return root;
}

/**
 * Fake migrations and seed that print the password on stdout and stderr, split across chunks
 * (the way a child process's output arrives), and the seed's publishable key line.
 */
function fakeCommands(password, { seedCode = 0 } = {}) {
  const half = Math.floor(password.length / 2);
  return async (command, _cwd, { onStdout, onStderr }) => {
    if (command.includes("migrate")) {
      onStdout(`migrating with ${password.slice(0, half)}`);
      onStdout(`${password.slice(half)} done\n`);
      onStderr(`warn: login ${password}\n`);
      return 0;
    }
    if (command.includes("seed")) {
      onStdout(`info: creating admin ${EMAIL} / ${password}\n`);
      onStderr(`${password.slice(0, 3)}`);
      onStderr(`${password.slice(3)}\n`);
      onStdout("FITMYOUTFIT_PUBLISHABLE_KEY=pk_test_123\n");
      return seedCode;
    }
    throw new Error(`unexpected command ${command}`);
  };
}

async function runCaptured(root, { env = {}, runCommand, canConnect = async () => true }) {
  let printed = "";
  const code = await runSetup({
    root,
    env,
    out: (text) => {
      printed += text;
    },
    err: (text) => {
      printed += text;
    },
    runCommand,
    canConnect,
  });
  return { code, printed };
}

test("a full setup run never prints the admin password, not even when the seed prints it", async () => {
  const root = makeCheckout();
  try {
    const { code, printed } = await runCaptured(root, { runCommand: fakeCommands(PASSWORD) });
    assert.equal(code, 0, printed);
    assert.match(printed, /\[setup\] done\./);
    assert.match(printed, /pk_test_123/);
    assert.match(printed, new RegExp(EMAIL.replace(/\./g, "\\.")));
    // The child output was echoed, with the password hidden.
    assert.match(printed, /migrating with \[hidden\] done/);
    assert.ok(printed.includes(REDACTED));
    assert.ok(!printed.includes(PASSWORD), `the password was printed:\n${printed}`);
    // Setup did its work: the key is in the storefront env file.
    assert.match(readFileSync(path.join(root, "storefront", ".env.local"), "utf8"), /pk_test_123/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a password set in the shell (which wins over backend/.env) is hidden too", async () => {
  const root = makeCheckout();
  try {
    const { code, printed } = await runCaptured(root, {
      env: { MEDUSA_ADMIN_PASSWORD: SHELL_PASSWORD },
      runCommand: fakeCommands(SHELL_PASSWORD),
    });
    assert.equal(code, 0, printed);
    assert.ok(!printed.includes(SHELL_PASSWORD), `the shell password was printed:\n${printed}`);
    assert.ok(!printed.includes(PASSWORD));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failing seed or an unreachable database prints no password either", async () => {
  const root = makeCheckout();
  try {
    const failed = await runCaptured(root, { runCommand: fakeCommands(PASSWORD, { seedCode: 1 }) });
    assert.equal(failed.code, 1);
    assert.match(failed.printed, /ERROR: seed failed/);
    assert.ok(!failed.printed.includes(PASSWORD));

    const unreachable = await runCaptured(root, {
      env: { DATABASE_URL: "postgres://u:p@localhost:5999/db" },
      runCommand: fakeCommands(PASSWORD),
      canConnect: async () => false,
    });
    assert.equal(unreachable.code, 1);
    assert.match(unreachable.printed, /DATABASE_URL in your shell environment/);
    assert.ok(!unreachable.printed.includes(PASSWORD));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A copy of setup.mjs and its helpers in a throwaway checkout, with a backend/package.json whose
 * `migrate` and `seed` scripts are fake: they print the password on stdout and stderr, and the
 * seed prints a publishable key. `npm run migrate --prefix backend` then runs them for real.
 * - `storefront: false` leaves storefront/ out (setup then skips storefront/.env.local).
 * - `migrateCode` is the fake migration's exit code (not 0: setup stops with "migrations failed").
 */
function makeChildCheckout(dbPort, { storefront = true, migrateCode = 0 } = {}) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "fmo-setup-child-")));
  const scriptsDir = path.join(root, "scripts");
  mkdirSync(path.join(scriptsDir, "lib"), { recursive: true });
  copyFileSync(path.join(here, "setup.mjs"), path.join(scriptsDir, "setup.mjs"));
  for (const file of readdirSync(path.join(here, "lib"))) {
    if (file.endsWith(".mjs") && !file.endsWith(".test.mjs")) {
      copyFileSync(path.join(here, "lib", file), path.join(scriptsDir, "lib", file));
    }
  }
  const backend = path.join(root, "backend");
  mkdirSync(backend);
  if (storefront) mkdirSync(path.join(root, "storefront"));
  writeFileSync(path.join(root, ".env.example"), "POSTGRES_PORT=5433\n");
  writeFileSync(
    path.join(backend, ".env.example"),
    [
      `DATABASE_URL=postgres://u:p@127.0.0.1:${dbPort}/db`,
      `MEDUSA_ADMIN_EMAIL=${EMAIL}`,
      `MEDUSA_ADMIN_PASSWORD=${PASSWORD}`,
      "",
    ].join("\n"),
  );
  if (storefront) {
    writeFileSync(path.join(root, "storefront", ".env.example"), "MEDUSA_BACKEND_URL=http://localhost:9000\n");
  }
  const half = Math.floor(PASSWORD.length / 2);
  writeFileSync(
    path.join(backend, "fake-migrate.mjs"),
    [
      `process.stdout.write(${JSON.stringify(`migrating with ${PASSWORD.slice(0, half)}`)});`,
      `setTimeout(() => process.stdout.write(${JSON.stringify(`${PASSWORD.slice(half)} done\n`)}), 50);`,
      `process.stderr.write(${JSON.stringify(`warn: login ${PASSWORD}\n`)});`,
      `process.exitCode = ${migrateCode};`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(backend, "fake-seed.mjs"),
    [
      `console.log(${JSON.stringify(`info: creating admin ${EMAIL} / ${PASSWORD}`)});`,
      `console.error(${JSON.stringify(PASSWORD)});`,
      `console.log("FITMYOUTFIT_PUBLISHABLE_KEY=pk_child_456");`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(backend, "package.json"),
    JSON.stringify(
      {
        name: "fake-backend",
        private: true,
        scripts: { migrate: "node fake-migrate.mjs", seed: "node fake-seed.mjs" },
      },
      null,
      2,
    ),
  );
  return root;
}

/** The current environment without the variables setup reads and without npm's own settings. */
function cleanChildEnv() {
  const env = {};
  const drop = new Set(["DATABASE_URL", "REDIS_URL", "MEDUSA_ADMIN_EMAIL", "MEDUSA_ADMIN_PASSWORD", "PORT"]);
  for (const [key, value] of Object.entries(process.env)) {
    if (drop.has(key.toUpperCase()) || key.toLowerCase().startsWith("npm_")) continue;
    env[key] = value;
  }
  return env;
}

/** Run `node scripts/setup.mjs` in `root` and collect every byte it writes to stdout and stderr. */
function runSetupProcess(root, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "setup.mjs")], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Run setup.mjs as a child process in a checkout made by makeChildCheckout(port, options), with
 * something listening on `port` for setup's "is PostgreSQL reachable?" check (no database is
 * needed), and hand its exit code, stdout and stderr to `check`.
 */
async function withSetupProcess(options, check) {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = makeChildCheckout(server.address().port, options);
  try {
    await check(root, await runSetupProcess(root, cleanChildEnv()));
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
}

/** Neither stdout nor stderr holds the password. */
function assertNoPassword({ stdout, stderr }) {
  assert.ok(!stdout.includes(PASSWORD), `the password was printed on stdout:\n${stdout}`);
  assert.ok(!stderr.includes(PASSWORD), `the password was printed on stderr:\n${stderr}`);
}

test(
  "setup.mjs run as a real process never prints the admin password on stdout or stderr",
  { timeout: 300_000 },
  async () => {
    await withSetupProcess({}, async (root, { code, stdout, stderr }) => {
      const everything = `${stdout}\n${stderr}`;
      assert.equal(code, 0, everything);
      // Setup really ran the fake commands and finished.
      assert.match(stdout, /\[setup\] done\./);
      assert.match(stdout, /pk_child_456/);
      assert.match(stdout, /migrating with \[hidden\] done/);
      assert.ok(everything.includes(REDACTED));
      assert.match(readFileSync(path.join(root, "storefront", ".env.local"), "utf8"), /pk_child_456/);
      // The admin URL uses the default backend port.
      assert.match(stdout, /http:\/\/localhost:9000\/app/);
      assertNoPassword({ stdout, stderr });
    });
  },
);

// QA, fourth review: a print of the password only on these two paths passed every test.
test(
  "setup.mjs run as a real process without storefront/ prints no password",
  { timeout: 300_000 },
  async () => {
    await withSetupProcess({ storefront: false }, async (root, { code, stdout, stderr }) => {
      const everything = `${stdout}\n${stderr}`;
      assert.equal(code, 0, everything);
      // Setup took the path without a storefront and finished.
      assert.match(stderr, /storefront\/ does not exist yet/);
      assert.match(stdout, /\[setup\] done\./);
      assert.match(stdout, /pk_child_456/);
      assert.ok(everything.includes(REDACTED));
      assert.doesNotMatch(stdout, /wrote NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY/);
      assertNoPassword({ stdout, stderr });
    });
  },
);

test(
  "setup.mjs run as a real process with a failing migration prints no password",
  { timeout: 300_000 },
  async () => {
    await withSetupProcess({ migrateCode: 1 }, async (_root, { code, stdout, stderr }) => {
      const everything = `${stdout}\n${stderr}`;
      assert.equal(code, 1, everything);
      // Setup echoed the migration's output (hidden), stopped there and never seeded.
      assert.match(stdout, /migrating with \[hidden\] done/);
      assert.match(stderr, /\[setup\] ERROR: migrations failed/);
      assert.doesNotMatch(everything, /seeding placeholder data|pk_child_456/);
      assertNoPassword({ stdout, stderr });
    });
  },
);

test("spawnCommand pipes both stdout and stderr to the caller, so nothing bypasses the filter", async () => {
  const chunks = { out: "", err: "" };
  const script = "process.stdout.write('to-stdout'); process.stderr.write('to-stderr')";
  const code = await spawnCommand(`node -e "${script}"`, process.cwd(), {
    onStdout: (chunk) => {
      chunks.out += chunk;
    },
    onStderr: (chunk) => {
      chunks.err += chunk;
    },
  });
  assert.equal(code, 0);
  assert.equal(chunks.out, "to-stdout");
  assert.equal(chunks.err, "to-stderr");
});
