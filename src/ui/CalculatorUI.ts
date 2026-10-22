import type { ThemeMode } from "../themes/ThemeManager";
import { DisplayFitter } from "./DisplayFitter";

const MODE_LABELS: Record<ThemeMode, string> = {
  normal: "NORMAL MODE",
  pro: "PRO MODE",
};

/** Renders calculator state into one calculator root. Contains no calculation logic. */
export class CalculatorUI {
  private resizeWatch: AbortController | null = null;

  constructor(
    private readonly root: ParentNode,
    private readonly displayFitter: DisplayFitter = new DisplayFitter(),
  ) {}

  renderMode(mode: ThemeMode): void {
    const toggle = this.root.querySelector<HTMLButtonElement>(".mode-toggle");
    const label = toggle?.querySelector<HTMLElement>(".mode-toggle__label");
    if (!toggle || !label) return;

    label.textContent = MODE_LABELS[mode];
    toggle.setAttribute("aria-checked", String(mode === "pro"));
  }

  renderDisplay(value: string): void {
    const output = this.displayOutput;
    if (!output) return;

    output.textContent = value;
    this.displayFitter.fit(output);
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

  private get displayOutput(): HTMLOutputElement | null {
    return this.root.querySelector<HTMLOutputElement>(".display__value");
  }

  private refit(): void {
    const output = this.displayOutput;
    if (output) this.displayFitter.fit(output);
  }
}
