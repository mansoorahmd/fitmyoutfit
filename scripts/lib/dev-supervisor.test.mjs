import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { CHILD_ENDED_EXIT_CODE, childEndedOutcome, createDevSupervisor } from "./dev-supervisor.mjs";

/** A supervisor with stand-in kill / exit / warn that record what they were asked to do. */
function recorded() {
  const calls = { killed: [], exits: [], warnings: [] };
  const supervisor = createDevSupervisor({
    kill: (child) => calls.killed.push(child.name),
    exit: (code) => calls.exits.push(code),
    warn: (message) => calls.warnings.push(message),
  });
  const child = (name) => Object.assign(new EventEmitter(), { name });
  return { calls, supervisor, child };
}

test("childEndedOutcome: a child that exits on its own with code 0 makes dev exit non-zero", () => {
  const outcome = childEndedOutcome("storefront", 0, null, ["backend"]);
  assert.equal(outcome.exitCode, 1);
  assert.notEqual(outcome.exitCode, 0);
  assert.match(outcome.message, /^storefront exited on its own with code 0; stopping backend\. /);
  assert.match(outcome.message, /dev exits with code 1/);
});

test("childEndedOutcome: a non-zero code is passed on, a signal or no code gives 1", () => {
  assert.equal(childEndedOutcome("backend", 3, null).exitCode, 3);
  assert.equal(childEndedOutcome("backend", 1, null).exitCode, 1);
  const bySignal = childEndedOutcome("backend", null, "SIGKILL", ["storefront"]);
  assert.equal(bySignal.exitCode, CHILD_ENDED_EXIT_CODE);
  assert.match(bySignal.message, /^backend exited on its own on signal SIGKILL; stopping storefront\./);
  const unknown = childEndedOutcome("backend", null, null);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.message, /^backend exited on its own\. /);
});

test("a child exiting with 0 stops the other child and exits non-zero, naming the child", () => {
  const { calls, supervisor, child } = recorded();
  const backend = child("backend");
  const storefront = child("storefront");
  supervisor.add("backend", backend);
  supervisor.add("storefront", storefront);

  storefront.emit("exit", 0, null);

  assert.deepEqual(calls.exits, [1]);
  assert.deepEqual(calls.killed.sort(), ["backend", "storefront"]);
  assert.equal(calls.warnings.length, 1);
  assert.match(calls.warnings[0], /^storefront exited on its own with code 0; stopping backend\./);
});

test("a child exiting with an error code makes dev exit with that code", () => {
  const { calls, supervisor, child } = recorded();
  const backend = child("backend");
  supervisor.add("backend", backend);
  supervisor.add("storefront", child("storefront"));

  backend.emit("exit", 7, null);

  assert.deepEqual(calls.exits, [7]);
  assert.match(calls.warnings[0], /^backend exited on its own with code 7; stopping storefront\./);
});

test("with only one child started, its exit with 0 still exits non-zero", () => {
  const { calls, supervisor, child } = recorded();
  const backend = child("backend");
  supervisor.add("backend", backend);

  backend.emit("exit", 0, null);

  assert.deepEqual(calls.exits, [1]);
  assert.match(calls.warnings[0], /^backend exited on its own with code 0\. /);
});

test("Ctrl+C (stop) stops every child and exits 0; the children's exits afterwards change nothing", () => {
  const { calls, supervisor, child } = recorded();
  const backend = child("backend");
  const storefront = child("storefront");
  supervisor.add("backend", backend);
  supervisor.add("storefront", storefront);

  supervisor.stop();
  backend.emit("exit", null, "SIGTERM");
  storefront.emit("exit", 1, null);
  supervisor.stop();

  assert.deepEqual(calls.exits, [0]);
  assert.deepEqual(calls.killed.sort(), ["backend", "storefront"]);
  assert.deepEqual(calls.warnings, []);
  assert.equal(supervisor.stopping, true);
});

test("only the first child's exit counts: the stopped child's exit afterwards is ignored", () => {
  const { calls, supervisor, child } = recorded();
  const backend = child("backend");
  const storefront = child("storefront");
  supervisor.add("backend", backend);
  supervisor.add("storefront", storefront);

  backend.emit("exit", 0, null);
  storefront.emit("exit", null, "SIGTERM");
  supervisor.stop();

  assert.deepEqual(calls.exits, [1]);
  assert.equal(calls.warnings.length, 1);
});

test("real processes: one child exits with 0 by itself, the other is stopped, dev exits 1", async () => {
  const spawnNode = (code) =>
    spawn(process.execPath, ["-e", code], { stdio: "ignore" });
  // Ends by itself with code 0 after a moment; the other would run for a minute.
  const quitter = spawnNode("setTimeout(() => process.exit(0), 200)");
  const runner = spawnNode("setTimeout(() => {}, 60000)");
  const runnerEnded = new Promise((resolve) =>
    runner.on("exit", (code, signal) => resolve({ code, signal }))
  );
  const warnings = [];
  const exitCode = await new Promise((resolve) => {
    const supervisor = createDevSupervisor({
      kill: (child) => {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      },
      exit: resolve,
      warn: (message) => warnings.push(message),
    });
    supervisor.add("storefront", quitter);
    supervisor.add("backend", runner);
  });

  assert.equal(exitCode, 1);
  assert.match(warnings[0], /^storefront exited on its own with code 0; stopping backend\./);
  // The other child was really stopped, long before its minute was up.
  const ended = await runnerEnded;
  assert.ok(ended.code !== 0 || ended.signal !== null, `runner ended with ${JSON.stringify(ended)}`);
  assert.notEqual(runner.exitCode ?? runner.signalCode, null);
});
