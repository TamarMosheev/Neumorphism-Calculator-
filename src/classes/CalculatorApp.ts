import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { CalculatorUI } from "../ui/CalculatorUI";
import { ThemeManager } from "../themes/ThemeManager";
import { InputHandler } from "./InputHandler";

type Lifecycle = "idle" | "running" | "disposed";

/**
 * Composition root: connects input events to the engine, and engine/theme state to the UI.
 * An instance runs once: `start()` registers listeners, `dispose()` removes them for good.
 */
export class CalculatorApp {
  private lifecycle: Lifecycle = "idle";

  constructor(
    private readonly engine: CalculatorEngine,
    private readonly ui: CalculatorUI,
    private readonly themeManager: ThemeManager,
    private readonly inputHandler: InputHandler,
  ) {}

  /** Registers all listeners. Calling it again, or after `dispose()`, does nothing. */
  start(): void {
    if (this.lifecycle !== "idle") return;
    this.lifecycle = "running";

    this.ui.renderMode(this.themeManager.mode);
    this.ui.watchResize();
    this.refreshDisplay();

    this.inputHandler.onNumber((digit) => this.apply(() => this.engine.inputDigit(digit)));
    this.inputHandler.onDecimal(() => this.apply(() => this.engine.inputDecimal()));
    this.inputHandler.onToggleSign(() => this.apply(() => this.engine.toggleSign()));
    this.inputHandler.onPercent(() => this.apply(() => this.engine.percent()));
    this.inputHandler.onOperator((operator) => this.apply(() => this.engine.setOperator(operator)));
    this.inputHandler.onEquals(() => this.apply(() => this.engine.equals()));
    this.inputHandler.onClear(() => this.apply(() => this.engine.clear()));
    this.inputHandler.onModeToggle(() => this.ui.renderMode(this.themeManager.toggle()));
  }

  /** Removes every listener the app registered. Safe to call more than once. */
  dispose(): void {
    if (this.lifecycle === "disposed") return;
    this.lifecycle = "disposed";

    this.inputHandler.dispose();
    this.ui.dispose();
  }

  private apply(action: () => void): void {
    action();
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    this.ui.renderDisplay(this.engine.displayValue);
  }
}
