// The one place in scripts/setup.mjs, scripts/dev.mjs and scripts/lib/ that writes to the terminal.
// ESLint (backend/eslint.scripts.config.mjs) forbids console.* and process.stdout / process.stderr
// in those files everywhere else, so everything setup prints goes through the `out` / `err`
// functions it is given, which setup-output.test.mjs captures. setup-output.test.mjs also runs
// setup.mjs as a child process and reads the process's whole stdout and stderr, so a print that
// gets past the lint rule is still caught.

/** Write text to the process's stdout, as it is (no newline added). */
export function writeStdout(text) {
  process.stdout.write(text);
}

/** Write text to the process's stderr, as it is (no newline added). */
export function writeStderr(text) {
  process.stderr.write(text);
}
