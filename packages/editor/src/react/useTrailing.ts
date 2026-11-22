/**
 * A value that follows another a moment after it stops changing, except when `restartKey` changes: then it follows at
 * once. The team list uses it for the shirt (08-team-list.md 13.5): typing never waits for the shirt, so a key press
 * updates the field in its own frame and the shirt is drawn once the keys pause; choosing another line is not typing
 * and shows its shirt at once.
 */
import { useEffect, useState } from "react";

export function useTrailing<T>(value: T, delayMs: number, restartKey: unknown): T {
  const [shown, setShown] = useState(value);
  const [key, setKey] = useState(restartKey);
  // Another line (the key changed): the value is taken at once, in the same render.
  if (!Object.is(key, restartKey)) {
    setKey(restartKey);
    setShown(value);
  }
  useEffect(() => {
    if (Object.is(shown, value)) return;
    const timer = setTimeout(() => setShown(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, shown, delayMs]);
  return Object.is(key, restartKey) ? shown : value;
}
