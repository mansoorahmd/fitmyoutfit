import assert from "node:assert/strict";
import { test } from "node:test";
import { createRedactor, redact, REDACTED } from "./redact.mjs";

const secret = "Known-Pass-123";

test("redact hides every occurrence of a secret", () => {
  assert.equal(redact(`a ${secret} b ${secret}`, [secret]), `a ${REDACTED} b ${REDACTED}`);
  assert.equal(redact("nothing here", [secret]), "nothing here");
  assert.equal(redact("text", [""]), "text");
  assert.equal(redact("text", []), "text");
});

test("a secret split across chunks is still hidden, at any split point", () => {
  const text = `before ${secret} after\n`;
  for (let i = 0; i <= text.length; i++) {
    for (let j = i; j <= text.length; j++) {
      const redactor = createRedactor([secret]);
      const printed =
        redactor.push(text.slice(0, i)) +
        redactor.push(text.slice(i, j)) +
        redactor.push(text.slice(j)) +
        redactor.flush();
      assert.equal(printed, `before ${REDACTED} after\n`, `split at ${i},${j}`);
    }
  }
});

test("a secret streamed one character at a time is never printed", () => {
  const redactor = createRedactor([secret]);
  let printed = "";
  for (const char of `x${secret}y${secret}`) {
    const now = redactor.push(char);
    printed += now;
    assert.ok(!printed.includes(secret));
  }
  printed += redactor.flush();
  assert.equal(printed, `x${REDACTED}y${REDACTED}`);
});

test("text that is not the start of a secret is printed at once (nothing is held back)", () => {
  const redactor = createRedactor([secret]);
  assert.equal(redactor.push("plain line\n"), "plain line\n");
  // A possible start of the secret waits for the next chunk...
  assert.equal(redactor.push("log: Known-"), "log: ");
  // ...and is printed when it turns out not to be the secret.
  assert.equal(redactor.push("Nothing\n"), "Known-Nothing\n");
  assert.equal(redactor.flush(), "");
});

test("the longer of two overlapping secrets is hidden whole", () => {
  assert.equal(redact("abc-long", ["abc", "abc-long"]), REDACTED);
});
