/** True when the event target is (or is inside) an editable field. */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as HTMLElement;
  if (typeof el.closest !== "function") return false;
  return !!el.closest(
    "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]"
  );
}
