/**
 * Take a Space (or Enter) press for a quiz shortcut.
 *
 * preventDefault alone is not enough: a button that was clicked with the mouse keeps keyboard
 * focus, and the browser clicks a focused button again when Space is released. In a quiz that
 * means "Space to hear it again" re-presses the last note button and answers the question instead.
 * So drop focus from whatever is focused and swallow the matching keyup as well.
 */
export function claimKey(e: KeyboardEvent) {
  e.preventDefault();
  const el = document.activeElement;
  if (el instanceof HTMLElement && el !== document.body) el.blur();
  const onUp = (up: KeyboardEvent) => {
    if (up.code !== e.code) return;
    up.preventDefault();
    window.removeEventListener("keyup", onUp);
  };
  window.addEventListener("keyup", onUp);
}
