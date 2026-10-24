export type CalculatorMode = "normal" | "pro";

/**
 * Which calculator is active. It is independent of the appearance (light or dark): it shares no state with
 * ThemeManager, touches no DOM, and does not hold either calculator's state, so switching modes can never
 * change or reset a calculator, and changing the appearance can never change the mode.
 */
export class CalculatorModeSetting {
  private current: CalculatorMode = "normal";

  get mode(): CalculatorMode {
    return this.current;
  }

  toggle(): CalculatorMode {
    this.current = this.current === "normal" ? "pro" : "normal";
    return this.current;
  }
}
