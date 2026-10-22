/** Smallest font size, in px, a value may shrink to before the CSS ellipsis becomes the last resort. */
const DEFAULT_MIN_FONT_SIZE = 10;

/**
 * Largest font size, no bigger than `base`, at which text of `contentWidth` fits in `availableWidth`.
 * Text width scales linearly with font size, so one proportional step gets (almost) there.
 */
export function fontSizeToFit(
  base: number,
  contentWidth: number,
  availableWidth: number,
  minFontSize: number,
): number {
  if (availableWidth <= 0 || contentWidth <= availableWidth) return base;

  return Math.max(minFontSize, Math.floor((base * availableWidth) / contentWidth));
}

/**
 * Shrinks an element's font size only when its text overflows, and restores the
 * stylesheet size otherwise. It owns sizing only: it never reads or changes the text.
 */
export class DisplayFitter {
  constructor(private readonly minFontSize: number = DEFAULT_MIN_FONT_SIZE) {}

  fit(element: HTMLElement): void {
    // Drop any earlier inline size so measurements start from the stylesheet (base) size.
    element.style.fontSize = "";

    const baseSize = parseFloat(getComputedStyle(element).fontSize);
    if (!Number.isFinite(baseSize)) return;

    let size = fontSizeToFit(
      baseSize,
      element.scrollWidth,
      element.clientWidth,
      this.minFontSize,
    );
    if (size >= baseSize) return;

    element.style.fontSize = `${size}px`;

    // Sub-pixel rounding can leave a pixel of overflow, so step down until it really fits.
    while (size > this.minFontSize && element.scrollWidth > element.clientWidth) {
      size -= 1;
      element.style.fontSize = `${size}px`;
    }
  }
}
