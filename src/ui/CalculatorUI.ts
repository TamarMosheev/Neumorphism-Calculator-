import type { CalculatorMode } from "../settings/CalculatorModeSetting";
import type { Appearance } from "../themes/ThemeManager";
import { DisplayFitter } from "./DisplayFitter";

type SettingName = "calculator-mode" | "appearance";

const CALCULATOR_MODE_LABELS: Record<CalculatorMode, string> = {
  normal: "NORMAL MODE",
  pro: "PRO MODE",
};

const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "LIGHT MODE",
  dark: "DARK MODE",
};

/** Set on <html> by the inline script in index.html while a saved PRO mode is restored; the stylesheet hides the app. */
const RESTORING_MODE_CLASS = "restoring-mode";

/** Renders calculator state into one calculator root. Contains no calculation logic. */
export class CalculatorUI {
  private resizeWatch: AbortController | null = null;

  constructor(
    private readonly root: ParentNode,
    private readonly displayFitter: DisplayFitter = new DisplayFitter(),
  ) {}

  renderCalculatorMode(mode: CalculatorMode): void {
    this.renderSwitch("calculator-mode", CALCULATOR_MODE_LABELS[mode], mode === "pro");

    // `hidden` removes the keys from layout, tab order and the accessibility tree in NORMAL.
    for (const proOnly of this.root.querySelectorAll<HTMLElement>("[data-pro-only]")) {
      proOnly.hidden = mode !== "pro";
    }
  }

  /** Shows the calculator once the saved mode is rendered (index.html hides it while a saved PRO mode is restored). */
  reveal(): void {
    document.documentElement.classList.remove(RESTORING_MODE_CLASS);
  }

  renderAppearance(appearance: Appearance): void {
    this.renderSwitch("appearance", APPEARANCE_LABELS[appearance], appearance === "dark");
  }

  renderDisplay(value: string): void {
    const output = this.displayOutput;
    if (!output) return;

    output.textContent = value;
    this.displayFitter.fit(output);
  }

  /** Shows the PRO expression. The full text stays reachable: it scrolls, keeping the newest end in view, and is the tooltip. */
  renderExpression(text: string): void {
    const output = this.expressionOutput;
    if (!output) return;

    output.textContent = text;
    output.title = text;
    output.scrollLeft = output.scrollWidth;
  }

  /** The display width follows the viewport on small screens, so refit when it changes. Idempotent. */
  watchResize(): void {
    if (this.resizeWatch !== null) return;

    this.resizeWatch = new AbortController();
    window.addEventListener("resize", () => this.refit(), { signal: this.resizeWatch.signal });
  }

  /** Stops watching the window. Safe to call more than once. */
  dispose(): void {
    this.resizeWatch?.abort();
    this.resizeWatch = null;
  }

  /** Shows a setting's current value on its pill: the visible text and the switch state (on = PRO / DARK). */
  private renderSwitch(setting: SettingName, text: string, on: boolean): void {
    const toggle = this.root.querySelector<HTMLButtonElement>(`[data-setting="${setting}"]`);
    const label = toggle?.querySelector<HTMLElement>(".mode-toggle__label");
    if (!toggle || !label) return;

    label.textContent = text;
    toggle.setAttribute("aria-checked", String(on));
  }

  private get displayOutput(): HTMLOutputElement | null {
    return this.root.querySelector<HTMLOutputElement>(".display__value");
  }

  private get expressionOutput(): HTMLOutputElement | null {
    return this.root.querySelector<HTMLOutputElement>(".display__expression");
  }

  private refit(): void {
    const output = this.displayOutput;
    if (output) this.displayFitter.fit(output);
  }
}
