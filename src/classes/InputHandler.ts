import { isOperator, type Operator } from "../calculator/Operator";

/**
 * Translates DOM click events inside one calculator root into typed callbacks.
 * Knows nothing about calculation. Every listener it adds is owned by one AbortController,
 * so `dispose()` removes them all at once and a disposed handler can never add new ones.
 */
export class InputHandler {
  private readonly lifecycle = new AbortController();

  constructor(private readonly root: ParentNode) {}

  onCalculatorModeToggle(callback: () => void): void {
    this.bindClick('[data-setting="calculator-mode"]', callback);
  }

  onAppearanceToggle(callback: () => void): void {
    this.bindClick('[data-setting="appearance"]', callback);
  }

  onClear(callback: () => void): void {
    this.bindClick('[data-action="clear"]', callback);
  }

  onDecimal(callback: () => void): void {
    this.bindClick('[data-action="decimal"]', callback);
  }

  onToggleSign(callback: () => void): void {
    this.bindClick('[data-action="toggle-sign"]', callback);
  }

  onPercent(callback: () => void): void {
    this.bindClick('[data-action="percent"]', callback);
  }

  onOpenParenthesis(callback: () => void): void {
    this.bindClick('[data-action="open-parenthesis"]', callback);
  }

  onCloseParenthesis(callback: () => void): void {
    this.bindClick('[data-action="close-parenthesis"]', callback);
  }

  onSquare(callback: () => void): void {
    this.bindClick('[data-action="square"]', callback);
  }

  onSquareRoot(callback: () => void): void {
    this.bindClick('[data-action="square-root"]', callback);
  }

  onEquals(callback: () => void): void {
    this.bindClick('[data-action="equals"]', callback);
  }

  onNumber(callback: (digit: string) => void): void {
    this.bindKeypadValue("number", callback);
  }

  onOperator(callback: (operator: Operator) => void): void {
    this.bindKeypadValue("operator", (value) => {
      if (isOperator(value)) callback(value);
    });
  }

  /** Removes every listener this handler added. Safe to call more than once. */
  dispose(): void {
    this.lifecycle.abort();
  }

  private bindClick(selector: string, callback: () => void): void {
    this.listen(this.root.querySelector(selector), () => callback());
  }

  /** One delegated listener on the keypad for buttons carrying `data-<name>`. */
  private bindKeypadValue(name: string, callback: (value: string) => void): void {
    this.listen(this.root.querySelector(".keypad"), (event) => {
      if (!(event.target instanceof Element)) return;

      const value = event.target.closest<HTMLElement>(`[data-${name}]`)?.dataset[name];
      if (value !== undefined) callback(value);
    });
  }

  private listen(target: Element | null, listener: (event: Event) => void): void {
    const { signal } = this.lifecycle;

    // Checked explicitly: not every environment ignores a listener added with an aborted signal.
    if (signal.aborted) return;

    target?.addEventListener("click", listener, { signal });
  }
}
