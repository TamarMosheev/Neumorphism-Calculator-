export type Appearance = "light" | "dark";

/**
 * The class that switches the page to the dark look. The name is legacy: the stylesheet keys all its dark
 * colours on `body.theme-pro`, and renaming that selector belongs to the CSS change, not to this class.
 * It means "dark appearance" only and has nothing to do with the PRO calculator.
 */
const DARK_APPEARANCE_CLASS = "theme-pro";

/** Light or dark appearance. Knows nothing about which calculator is active. */
export class ThemeManager {
  private current: Appearance = "light";

  constructor(private readonly root: HTMLElement = document.body) {}

  get appearance(): Appearance {
    return this.current;
  }

  toggle(): Appearance {
    this.current = this.current === "light" ? "dark" : "light";
    this.root.classList.toggle(DARK_APPEARANCE_CLASS, this.current === "dark");
    return this.current;
  }
}
