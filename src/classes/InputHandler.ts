import { isOperator, type Operator } from "../calculator/Operator";

/** Physical keys (KeyboardEvent.key) for the keys that also exist on the keypad. */
const CLEAR_KEYS = ["Escape"];
const DECIMAL_KEYS = ["."];
const PERCENT_KEYS = ["%"];
const EQUALS_KEYS = ["Enter", "="];
const OPEN_PARENTHESIS_KEYS = ["("];
const CLOSE_PARENTHESIS_KEYS = [")"];
const DIGIT_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const OPERATOR_KEYS: Readonly<Record<string, Operator>> = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
};

/** Text entry and the settings switches keep their own keyboard behaviour. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Translates DOM click events inside one calculator root, and physical key presses, into typed callbacks.
 * A key does what the matching keypad button does, through the same callback. Knows nothing about calculation.
 * Every listener it adds is owned by one AbortController, so `dispose()` removes them all at once and a
 * disposed handler can never add new ones.
 */
export class InputHandler {
  private readonly lifecycle = new AbortController();
  private readonly keyBindings = new Map<string, Array<() => void>>();
  private listeningToKeys = false;

  constructor(private readonly root: ParentNode) {}

  onCalculatorModeToggle(callback: () => void): void {
    this.bindClick('[data-setting="calculator-mode"]', callback);
  }

  onAppearanceToggle(callback: () => void): void {
    this.bindClick('[data-setting="appearance"]', callback);
  }

  onClear(callback: () => void): void {
    this.bindClick('[data-action="clear"]', callback);
    this.bindKeys(CLEAR_KEYS, callback);
  }

  onDecimal(callback: () => void): void {
    this.bindClick('[data-action="decimal"]', callback);
    this.bindKeys(DECIMAL_KEYS, callback);
  }

  onToggleSign(callback: () => void): void {
    this.bindClick('[data-action="toggle-sign"]', callback);
  }

  onPercent(callback: () => void): void {
    this.bindClick('[data-action="percent"]', callback);
    this.bindKeys(PERCENT_KEYS, callback);
  }

  onOpenParenthesis(callback: () => void): void {
    this.bindClick('[data-action="open-parenthesis"]', callback);
    this.bindKeys(OPEN_PARENTHESIS_KEYS, callback);
  }

  onCloseParenthesis(callback: () => void): void {
    this.bindClick('[data-action="close-parenthesis"]', callback);
    this.bindKeys(CLOSE_PARENTHESIS_KEYS, callback);
  }

  onSquare(callback: () => void): void {
    this.bindClick('[data-action="square"]', callback);
  }

  onSquareRoot(callback: () => void): void {
    this.bindClick('[data-action="square-root"]', callback);
  }

  onEquals(callback: () => void): void {
    this.bindClick('[data-action="equals"]', callback);
    this.bindKeys(EQUALS_KEYS, callback);
  }

  onNumber(callback: (digit: string) => void): void {
    this.bindKeypadValue("number", callback);
    for (const digit of DIGIT_KEYS) this.bindKeys([digit], () => callback(digit));
  }

  onOperator(callback: (operator: Operator) => void): void {
    this.bindKeypadValue("operator", (value) => {
      if (isOperator(value)) callback(value);
    });
    for (const [key, operator] of Object.entries(OPERATOR_KEYS)) this.bindKeys([key], () => callback(operator));
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

  private bindKeys(keys: readonly string[], callback: () => void): void {
    if (this.lifecycle.signal.aborted) return;

    for (const key of keys) this.keyBindings.set(key, [...(this.keyBindings.get(key) ?? []), callback]);
    this.listenToKeys();
  }

  /** One keydown listener for the whole page, added the first time a key is bound. */
  private listenToKeys(): void {
    if (this.listeningToKeys) return;

    const page = this.root instanceof Document ? this.root : this.root.ownerDocument;
    if (!page) return;

    this.listeningToKeys = true;
    page.addEventListener("keydown", (event) => this.handleKey(event), { signal: this.lifecycle.signal });
  }

  private handleKey(event: KeyboardEvent): void {
    // Browser and system shortcuts (Ctrl/Cmd/Alt), key repeat and IME composition are not calculator input.
    if (event.defaultPrevented || event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const callbacks = this.keyBindings.get(event.key);
    if (!callbacks || ownsKey(event)) return;

    event.preventDefault();
    for (const callback of callbacks) callback();
  }

  private listen(target: Element | null, listener: (event: Event) => void): void {
    const { signal } = this.lifecycle;

    // Checked explicitly: not every environment ignores a listener added with an aborted signal.
    if (signal.aborted) return;

    target?.addEventListener("click", listener, { signal });
  }
}

/**
 * True when the focused element should keep the key: text entry always, and Enter on a button outside the
 * keypad (the settings switches), where Enter activates that button. On a keypad button Enter means "=".
 */
function ownsKey(event: KeyboardEvent): boolean {
  if (!(event.target instanceof Element)) return false;
  if (event.target.closest(TEXT_ENTRY)) return true;

  return event.key === "Enter" && event.target.closest("button") !== null && event.target.closest(".keypad") === null;
}
