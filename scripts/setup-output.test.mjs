// What `npm run setup` prints must never contain the admin password (setup output ends up in
// terminals, logs and screenshots). These tests run the real setup flow (runSetup in setup.mjs)
// in a throwaway folder with a known password, with fake migrations and seed that print the
// password themselves, and check every character setup writes to stdout and stderr.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { REDACTED } from "./lib/redact.mjs";
import { runSetup, spawnCommand } from "./setup.mjs";

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
