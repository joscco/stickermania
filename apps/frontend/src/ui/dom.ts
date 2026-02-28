export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: { className?: string; text?: string; html?: string; attrs?: Record<string, string> }
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (options?.className) {
    element.className = options.className;
  }
  if (options?.text !== undefined) {
    element.textContent = options.text;
  }
  if (options?.html !== undefined) {
    element.innerHTML = options.html;
  }
  if (options?.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      element.setAttribute(key, value);
    }
  }
  return element;
}

export function clear(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}
