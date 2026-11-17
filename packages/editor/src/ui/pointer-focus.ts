/**
 * Moving focus in code (a panel opening puts it on its main button) must not draw the keyboard focus ring when the
 * coach got there with a mouse or a finger (E3e, QA 17): the ring is for the keyboard. The last kind of input is
 * remembered; the button takes focus either way, and carries `data-pointer-focus` (which the stylesheet reads) until
 * the first key is pressed.
 */
type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

let lastWasKey = false;
let installed: Target | null = null;

/** Starts remembering the kind of the last input on `target` (the window). Safe to call again. */
export function trackInputKind(target: Target | undefined = typeof window === "undefined" ? undefined : window): void {
  if (!target || installed === target) return;
  installed = target;
  target.addEventListener("keydown", () => (lastWasKey = true), true);
  for (const type of ["pointerdown", "mousedown", "touchstart"]) target.addEventListener(type, () => (lastWasKey = false), true);
}

/** Whether the last input was a key. */
export function lastInputWasKey(): boolean {
  return lastWasKey;
}

/** Test hook: forget what was seen. */
export function resetInputKind(): void {
  lastWasKey = false;
  installed = null;
}

/**
 * Focuses `el`. After a key the ring shows as usual; after a pointer (or no input at all) it does not, until a key
 * is pressed.
 */
export function focusForInput(el: HTMLElement): void {
  trackInputKind();
  if (lastWasKey) {
    el.removeAttribute("data-pointer-focus");
    el.focus({ preventScroll: true });
    return;
  }
  el.setAttribute("data-pointer-focus", "");
  const clear = () => {
    el.removeAttribute("data-pointer-focus");
    el.removeEventListener("keydown", clear);
    el.removeEventListener("blur", clear);
  };
  el.addEventListener("keydown", clear);
  el.addEventListener("blur", clear);
  // `focusVisible: false` is understood by newer browsers; the attribute covers the rest.
  el.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
