/**
 * What the editor hands to its host after a change (08-team-list.md 11.1 and 12.3): after `delayMs` without changes
 * (1 s), never on every key press, and at once when the host asks (`flush`: the Done panel, leaving). Plain timers,
 * injectable for tests. Nothing runs on import.
 */
export interface HandOver<T> {
  /** The value to hand over: it replaces one already waiting, and the wait starts again. */
  schedule(value: T): void;
  /** Hands over the waiting value now; nothing when none waits. */
  flush(): void;
  /** Forgets the waiting value without handing it over. */
  dispose(): void;
  readonly pending: boolean;
}

export function createHandOver<T>(options: {
  delayMs: number | (() => number);
  emit: (value: T) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): HandOver<T> {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let waiting: { value: T } | null = null;
  let timer: unknown = null;
  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const flush = () => {
    stop();
    const next = waiting;
    waiting = null;
    if (next) options.emit(next.value);
  };
  return {
    schedule(value) {
      waiting = { value };
      stop();
      const ms = typeof options.delayMs === "function" ? options.delayMs() : options.delayMs;
      timer = setTimer(flush, ms);
    },
    flush,
    dispose() {
      stop();
      waiting = null;
    },
    get pending() {
      return waiting !== null;
    },
  };
}
