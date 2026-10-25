import type { BasicCalculator } from "../calculator/BasicCalculator";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { NormalCalculator } from "../calculator/NormalCalculator";
import { ProCalculator } from "../calculator/pro/ProCalculator";
import { CalculatorModeSetting } from "../settings/CalculatorModeSetting";
import type { UserPreferences } from "../settings/UserPreferences";
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
  /** The engine plus the expression entered on it; the engine itself still does all the calculating. */
  private readonly normalCalculator: NormalCalculator;

  constructor(
    engine: CalculatorEngine,
    private readonly ui: CalculatorUI,
    private readonly themeManager: ThemeManager,
    private readonly inputHandler: InputHandler,
    private readonly calculatorMode: CalculatorModeSetting = new CalculatorModeSetting(),
    private readonly proCalculator: ProCalculator = new ProCalculator(),
    /** Where the two settings are remembered; without it they last until the page closes. */
    private readonly preferences: UserPreferences | null = null,
  ) {
    this.normalCalculator = new NormalCalculator(engine);
  }

  /** Registers all listeners. Calling it again, or after `dispose()`, does nothing. */
  start(): void {
    if (this.lifecycle !== "idle") return;
    this.lifecycle = "running";

    this.ui.renderCalculatorMode(this.calculatorMode.mode);
    this.ui.renderAppearance(this.themeManager.appearance);
    this.ui.watchResize();
    this.refreshDisplay();
    this.ui.reveal();

    this.inputHandler.onNumber((digit) => this.apply((calculator) => calculator.inputDigit(digit)));
    this.inputHandler.onDecimal(() => this.apply((calculator) => calculator.inputDecimal()));
    this.inputHandler.onToggleSign(() => this.apply((calculator) => calculator.toggleSign()));
    this.inputHandler.onPercent(() => this.apply((calculator) => calculator.percent()));
    this.inputHandler.onOperator((operator) => this.apply((calculator) => calculator.setOperator(operator)));
    this.inputHandler.onEquals(() => this.apply((calculator) => calculator.equals()));
    this.inputHandler.onClear(() => this.apply((calculator) => calculator.clear()));
    // PRO-only keys: the row is hidden in NORMAL, and a stray click there is ignored as well.
    this.inputHandler.onOpenParenthesis(() => this.applyPro((pro) => pro.openParenthesis()));
    this.inputHandler.onCloseParenthesis(() => this.applyPro((pro) => pro.closeParenthesis()));
    this.inputHandler.onSquare(() => this.applyPro((pro) => pro.square()));
    this.inputHandler.onSquareRoot(() => this.applyPro((pro) => pro.squareRoot()));
    // The two settings are independent. Both calculators stay alive, so switching modes only changes which
    // one the keypad drives and the display shows: neither is reset, and the appearance is not involved.
    this.inputHandler.onCalculatorModeToggle(() => {
      const mode = this.calculatorMode.toggle();
      this.preferences?.saveCalculatorMode(mode);
      this.ui.renderCalculatorMode(mode);
      this.refreshDisplay();
    });
    this.inputHandler.onAppearanceToggle(() => {
      const appearance = this.themeManager.toggle();
      this.preferences?.saveAppearance(appearance);
      this.ui.renderAppearance(appearance);
    });
  }

  /** Removes every listener the app registered. Safe to call more than once. */
  dispose(): void {
    if (this.lifecycle === "disposed") return;
    this.lifecycle = "disposed";

    this.inputHandler.dispose();
    this.ui.dispose();
  }

  private get activeCalculator(): BasicCalculator {
    return this.calculatorMode.mode === "pro" ? this.proCalculator : this.normalCalculator;
  }

  private apply(action: (calculator: BasicCalculator) => void): void {
    action(this.activeCalculator);
    this.refreshDisplay();
  }

  private applyPro(action: (pro: ProCalculator) => void): void {
    if (this.calculatorMode.mode !== "pro") return;

    action(this.proCalculator);
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    const calculator = this.activeCalculator;

    this.ui.renderDisplay(calculator.displayValue);
    this.ui.renderExpression(calculator.expressionText);
  }
}
