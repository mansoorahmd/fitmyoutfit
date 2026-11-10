// Small helpers for .env files. Plain functions with no side effects, tested in env-file.test.mjs.

/** Parse KEY=value lines. Ignores comments and blank lines. Strips matching surrounding quotes. */
export function parseEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Set one KEY=value in the content of an env file and leave every other line exactly as it was.
 * If the key exists, only that line changes (an `export ` prefix is kept). If it does not, the line
 * is appended. Line endings of the file are kept (CRLF stays CRLF).
 * Returns the new content and whether anything changed.
 */
export function upsertEnvVar(content, key, value) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content === "" ? [] : content.split(/\r?\n/);
  const pattern = new RegExp(`^(\\s*(?:export\\s+)?)${escapeRegExp(key)}\\s*=`);
  let found = false;
  let changed = false;
  const next = lines.map((line) => {
    const match = line.match(pattern);
    if (!match || found) return line;
    found = true;
    const updated = `${match[1]}${key}=${value}`;
    if (updated !== line) changed = true;
    return updated;
  });
  if (!found) {
    // Drop the empty element a trailing newline leaves at the end, then append and restore it.
    if (next.length > 0 && next[next.length - 1] === "") next.pop();
    next.push(`${key}=${value}`);
    next.push("");
    changed = true;
  }
  return { content: next.join(eol), changed };
}

/** Find the publishable key the seed prints as `FITMYOUTFIT_PUBLISHABLE_KEY=pk_...`. */
export function extractPublishableKey(output) {
  const matches = [...output.matchAll(/^FITMYOUTFIT_PUBLISHABLE_KEY=(\S+)\s*$/gm)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
