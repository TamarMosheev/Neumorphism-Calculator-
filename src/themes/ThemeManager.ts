export type ThemeMode = "normal" | "pro";

const PRO_THEME_CLASS = "theme-pro";

export class ThemeManager {
  private currentMode: ThemeMode = "normal";

  constructor(private readonly root: HTMLElement = document.body) {}

  get mode(): ThemeMode {
    return this.currentMode;
  }

  toggle(): ThemeMode {
    this.currentMode = this.currentMode === "normal" ? "pro" : "normal";
    this.root.classList.toggle(PRO_THEME_CLASS, this.currentMode === "pro");
    return this.currentMode;
  }
}
