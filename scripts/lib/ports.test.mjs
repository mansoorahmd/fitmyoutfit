import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  backendPort,
  devChildEnv,
  devUrlLines,
  localUrl,
  readBackendEnvFilePort,
  storefrontPort,
} from "./ports.mjs";

test("backendPort: PORT from the shell wins over backend/.env, and the default is 9000", () => {
  assert.equal(backendPort({}, undefined), "9000");
  assert.equal(backendPort({}, "9005"), "9005");
  assert.equal(backendPort({ PORT: "9007" }, "9005"), "9007");
  assert.equal(backendPort({ PORT: " 9008 " }), "9008");
});

test("backendPort: a blank PORT counts as unset", () => {
  assert.equal(backendPort({ PORT: "" }, "9005"), "9005");
  assert.equal(backendPort({ PORT: "  " }, ""), "9000");
});

test("storefrontPort: STOREFRONT_PORT from the shell, default 8000; the backend's PORT does not count", () => {
  assert.equal(storefrontPort({}), "8000");
  assert.equal(storefrontPort({ STOREFRONT_PORT: "8006" }), "8006");
  assert.equal(storefrontPort({ STOREFRONT_PORT: " " }), "8000");
  assert.equal(storefrontPort({ PORT: "9005" }), "8000");
});

test("localUrl", () => {
  assert.equal(localUrl("9005"), "http://localhost:9005");
});

test("devChildEnv gives the storefront STOREFRONT_PORT (default 8000) and not the backend's PORT", () => {
  const shell = { PATH: "/bin", PORT: "9005", STOREFRONT_PORT: "8006" };
  assert.deepEqual(devChildEnv("storefront", shell), { PATH: "/bin", STOREFRONT_PORT: "8006" });
  assert.deepEqual(devChildEnv("storefront", { PATH: "/bin" }), { PATH: "/bin", STOREFRONT_PORT: "8000" });
  // Windows keeps the case a variable was set with; PORT is dropped whatever its case.
  assert.equal("Port" in devChildEnv("storefront", { Port: "9005" }), false);
});

test("devChildEnv gives the backend its PORT: the shell's, else backend/.env's, else 9000", () => {
  assert.deepEqual(devChildEnv("backend", { PATH: "/bin", STOREFRONT_PORT: "8006" }), {
    PATH: "/bin",
    STOREFRONT_PORT: "8006",
    PORT: "9000",
  });
  assert.equal(devChildEnv("backend", {}, "9005").PORT, "9005");
  assert.equal(devChildEnv("backend", { PORT: "9007" }, "9005").PORT, "9007");
});

test("devUrlLines prints both ports, only for the parts that started", () => {
  const shell = { PORT: "9005", STOREFRONT_PORT: "8006" };
  assert.deepEqual(devUrlLines(["backend", "storefront"], shell), [
    "backend:    http://localhost:9005 (admin at http://localhost:9005/app)",
    "storefront: http://localhost:8006",
  ]);
  assert.deepEqual(devUrlLines(["storefront"], {}), ["storefront: http://localhost:8000"]);
  assert.deepEqual(devUrlLines(["backend"], {}, "9001"), [
    "backend:    http://localhost:9001 (admin at http://localhost:9001/app)",
  ]);
});

test("readBackendEnvFilePort returns only PORT from backend/.env, never the rest of the file", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fmo-ports-test-"));
  try {
    const file = path.join(dir, ".env");
    assert.equal(readBackendEnvFilePort(file), undefined);
    writeFileSync(file, "MEDUSA_ADMIN_PASSWORD=Known-Test-Pass-4711\nPORT=9005\n");
    assert.equal(readBackendEnvFilePort(file), "9005");
    writeFileSync(file, "MEDUSA_ADMIN_PASSWORD=Known-Test-Pass-4711\n");
    assert.equal(readBackendEnvFilePort(file), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
