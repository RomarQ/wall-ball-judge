/** The element with `id`, which the page must hold. */
export function $<T extends Element = HTMLElement>(id: string): T {
  const el: Element | null = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

/** Sets the text of the element with `id`, writing only a change: a write to the page costs a layout even when the text is the same. */
export function setText(id: string, text: string): void {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}
