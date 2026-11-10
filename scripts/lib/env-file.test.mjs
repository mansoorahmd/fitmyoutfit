import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPublishableKey, parseEnv, upsertEnvVar } from "./env-file.mjs";

test("parseEnv reads values, skips comments and strips quotes", () => {
  const parsed = parseEnv('# comment\nA=1\n\nB="two words"\nC=http://x:1/y=z\r\n');
  assert.deepEqual(parsed, { A: "1", B: "two words", C: "http://x:1/y=z" });
});

test("upsertEnvVar appends a missing key and keeps every other line", () => {
  const before = "# my file\nMEDUSA_BACKEND_URL=http://localhost:9000\nOTHER=keep me\n";
  const { content, changed } = upsertEnvVar(before, "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "pk_1");
  assert.equal(changed, true);
  assert.equal(content, `${before}NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_1\n`);
});

test("upsertEnvVar replaces only the matching line", () => {
  const before = "A=1\nNEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=\nB=2\n";
  const { content, changed } = upsertEnvVar(before, "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "pk_2");
  assert.equal(changed, true);
  assert.equal(content, "A=1\nNEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_2\nB=2\n");
});

test("upsertEnvVar reports no change when the value is already there", () => {
  const before = "A=1\nK=same\n";
  const { content, changed } = upsertEnvVar(before, "K", "same");
  assert.equal(changed, false);
  assert.equal(content, before);
});

test("upsertEnvVar does not match keys that merely start with the same text", () => {
  const before = "K_OTHER=1\n";
  const { content } = upsertEnvVar(before, "K", "v");
  assert.equal(content, "K_OTHER=1\nK=v\n");
});

test("upsertEnvVar keeps CRLF line endings and works on an empty file", () => {
  assert.equal(upsertEnvVar("A=1\r\nK=old\r\n", "K", "new").content, "A=1\r\nK=new\r\n");
  assert.equal(upsertEnvVar("", "K", "v").content, "K=v\n");
});

test("extractPublishableKey finds the marker line among log output", () => {
  const output = "info: x\nFITMYOUTFIT_PUBLISHABLE_KEY=pk_abc123\ninfo: done\n";
  assert.equal(extractPublishableKey(output), "pk_abc123");
  assert.equal(extractPublishableKey("no key here"), null);
});
