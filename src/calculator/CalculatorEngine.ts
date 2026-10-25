import {
  type CalculatorPhase,
  type CalculatorState,
  type PendingOperation,
  type Operand,
  computed,
  displayTextOf,
  ERROR_STATE,
  INITIAL_STATE,
  negate,
  operandNumber,
  previewTextOf,
  typed,
} from "./CalculatorState";
import { appendDecimal, appendDigit, MAX_ENTRY_DIGITS } from "./NumberEntry";
import { calculate, resolvePercent, type Operator } from "./Operator";

/** What the next digit or decimal point should extend: the text typed so far ("" = a new operand). */
interface TypingBase {
  readonly text: string;
  readonly pending: PendingOperation | null;
}

/** Calculator rules as transitions between `CalculatorState`s. Knows nothing about the DOM. */
export class CalculatorEngine {
  /** Longest number the user can type (the rule itself lives in NumberEntry). */
  static readonly MAX_ENTRY_DIGITS = MAX_ENTRY_DIGITS;

  private state: CalculatorState = INITIAL_STATE;

  get displayValue(): string {
    return displayTextOf(this.state);
  }

  /** The value of the calculation so far, for the large display; `displayValue` stays the operand itself. */
  get previewValue(): string {
    return previewTextOf(this.state);
  }

  get phase(): CalculatorPhase {
    return this.state.kind;
  }

  clear(): void {
    this.state = INITIAL_STATE;
  }

  inputDigit(digit: string): void {
    const { text, pending } = this.typingBase();

    const next = appendDigit(text, digit);
    if (next !== null) this.enter(next, pending);
  }

  inputDecimal(): void {
    const { text, pending } = this.typingBase();

    const next = appendDecimal(text);
    if (next !== null) this.enter(next, pending);
  }

  toggleSign(): void {
    const state = this.state;

    if (state.kind === "result") {
      if (state.value !== 0) this.state = { kind: "result", value: -state.value };
      return;
    }

    // Nothing to negate while waiting for an operand, in error, or for a zero.
    if (state.kind !== "entering" || operandNumber(state.operand) === 0) return;

    this.state = { ...state, operand: negate(state.operand) };
  }

  percent(): void {
    const state = this.state;

    if (state.kind === "result") {
      this.state = { kind: "result", value: resolvePercent(null, null, state.value) };
      return;
    }

    // Nothing to convert while waiting for an operand or in error.
    if (state.kind !== "entering") return;

    const value = resolvePercent(
      state.pending?.operator ?? null,
      state.pending?.firstOperand ?? null,
      operandNumber(state.operand),
    );
    this.state = { ...state, operand: computed(value) };
  }

  setOperator(operator: Operator): void {
    const state = this.state;

    switch (state.kind) {
      case "error":
        return;

      case "awaitingOperand":
        // Two operators in a row: the last one wins.
        this.state = { ...state, pending: { operator, firstOperand: state.pending.firstOperand } };
        return;

      case "result":
        this.awaitOperand(computed(state.value), operator);
        return;

      case "entering": {
        if (state.pending === null) {
          this.awaitOperand(state.operand, operator);
          return;
        }

        // Chaining: 2 + 3 × ... evaluates 2 + 3 first.
        const total = calculate(state.pending.operator, state.pending.firstOperand, operandNumber(state.operand));
        if (total === null) {
          this.state = ERROR_STATE;
          return;
        }
        this.awaitOperand(computed(total), operator);
        return;
      }
    }
  }

  equals(): void {
    const state = this.state;

    if (state.kind !== "entering" && state.kind !== "awaitingOperand") return;
    if (state.pending === null) return;

    // After an operator with no second operand typed, the displayed number is used again (7 + =).
    const value = calculate(state.pending.operator, state.pending.firstOperand, operandNumber(state.operand));
    this.state = value === null ? ERROR_STATE : { kind: "result", value };
  }

  private enter(text: string, pending: PendingOperation | null): void {
    this.state = { kind: "entering", operand: typed(text), pending };
  }

  private awaitOperand(operand: Operand, operator: Operator): void {
    this.state = {
      kind: "awaitingOperand",
      operand,
      pending: { operator, firstOperand: operandNumber(operand) },
    };
  }

  /** Decides where the next digit or decimal point goes, keeping any pending operator. */
  private typingBase(): TypingBase {
    const state = this.state;

    switch (state.kind) {
      case "entering":
        // A value produced by % is final: typing replaces it instead of extending it.
        return state.operand.kind === "typed"
          ? { text: state.operand.text, pending: state.pending }
          : { text: "", pending: state.pending };

      case "awaitingOperand":
        return { text: "", pending: state.pending };

      case "result":
      case "error":
        return { text: "", pending: null };
    }
  }
}
