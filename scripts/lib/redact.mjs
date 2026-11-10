// Hide secret values in text that is printed while it streams in (the output of the migrations
// and the seed, which `npm run setup` echoes). Plain functions, tested in redact.test.mjs.

export const REDACTED = "[hidden]";

/**
 * A filter for streamed text. `push(chunk)` returns the part that is safe to print now;
 * `flush()` returns the rest at the end. A secret split across two chunks is still hidden:
 * text at the end of a chunk that could be the start of a secret is held back until the next
 * chunk shows whether it is one. Empty secrets are ignored.
 */
export function createRedactor(secrets, replacement = REDACTED) {
  const list = [...new Set((secrets ?? []).filter((s) => typeof s === "string" && s.length > 0))]
    // Longest first, so a secret that contains another is hidden whole.
    .sort((a, b) => b.length - a.length);
  const redactAll = (text) => list.reduce((result, secret) => result.split(secret).join(replacement), text);
  let pending = "";

  /** Index where a held-back tail starts: the earliest suffix that is a prefix of a secret. */
  function holdFrom(text) {
    const longest = list.length > 0 ? list[0].length : 0;
    for (let i = Math.max(0, text.length - longest + 1); i < text.length; i++) {
      const tail = text.slice(i);
      if (list.some((secret) => secret.startsWith(tail))) return i;
    }
    return text.length;
  }

  return {
    push(chunk) {
      const text = redactAll(pending + String(chunk));
      const cut = holdFrom(text);
      pending = text.slice(cut);
      return text.slice(0, cut);
    },
    flush() {
      const rest = redactAll(pending);
      pending = "";
      return rest;
    },
  };
}

/** Hide every secret in a complete piece of text. */
export function redact(text, secrets, replacement = REDACTED) {
  const redactor = createRedactor(secrets, replacement);
  return redactor.push(text) + redactor.flush();
}
