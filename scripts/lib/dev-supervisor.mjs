// What `npm run dev` (scripts/dev.mjs) does when one of its children ends, or when the developer
// stops it. Tested in dev-supervisor.test.mjs, with stand-in children and with real ones.
//
// - A child that exits on its own, with any code (0 included), means the dev servers are gone.
//   dev stops the other children, says which child ended, and exits non-zero: the child's own code
//   when it is not 0, else 1. (Before S1-7 a child that exited with 0 made dev exit 0, which read
//   as success.)
// - Ctrl+C (SIGINT) or SIGTERM: dev stops every child and exits 0. Children that exit after that,
//   because they were stopped, change nothing.

/** Exit code when a child ended with code 0 or by a signal: anything but 0. */
export const CHILD_ENDED_EXIT_CODE = 1;

/** How a child ended, for the message: "with code 0", "on signal SIGKILL", or "". */
function howItEnded(code, signal) {
  if (typeof code === "number") return `with code ${code}`;
  if (signal) return `on signal ${signal}`;
  return "";
}

/**
 * The exit code and the message for a child `name` that exited on its own with `code` (a number,
 * or null when a signal ended it) or `signal`, while `others` (names) were still running.
 * The exit code is never 0.
 */
export function childEndedOutcome(name, code, signal, others = []) {
  const exitCode = typeof code === "number" && code !== 0 ? code : CHILD_ENDED_EXIT_CODE;
  const how = howItEnded(code, signal);
  const stopping = others.length > 0 ? `; stopping ${others.join(", ")}` : "";
  return {
    exitCode,
    message:
      `${name} exited on its own${how ? ` ${how}` : ""}${stopping}. ` +
      `The dev servers are not all running, so dev exits with code ${exitCode}: ` +
      `see ${name}'s output above, then run npm run dev again`,
  };
}

/**
 * Watches dev's children. `kill(child)` stops a child (and its process tree), `exit(code)` ends
 * dev, `warn(message)` prints one status line. `add(name, child)` registers a child (any object
 * with `on("exit", (code, signal) => ...)`, such as a ChildProcess); `stop()` is the Ctrl+C path.
 * Only the first event counts: once dev is stopping, later child exits are ignored.
 */
export function createDevSupervisor({ kill, exit, warn }) {
  const children = [];
  let stopping = false;

  function stopChildren() {
    for (const { child } of children) kill(child);
  }

  function childExited(name, code, signal) {
    if (stopping) return;
    stopping = true;
    const others = children
      .filter((entry) => entry.name !== name && !entry.exited)
      .map((entry) => entry.name);
    const { exitCode, message } = childEndedOutcome(name, code, signal, others);
    warn(message);
    stopChildren();
    exit(exitCode);
  }

  return {
    add(name, child) {
      const entry = { name, child, exited: false };
      children.push(entry);
      child.on("exit", (code, signal) => {
        entry.exited = true;
        childExited(name, code, signal);
      });
    },
    /** Ctrl+C or SIGTERM: stop every child and exit 0. */
    stop() {
      if (stopping) return;
      stopping = true;
      stopChildren();
      exit(0);
    },
    get stopping() {
      return stopping;
    },
  };
}
