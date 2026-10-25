import type { BasicCalculator } from "./BasicCalculator";
import { CalculatorEngine } from "./CalculatorEngine";
import type { CalculatorPhase } from "./CalculatorState";
import { isOperator, OPERATOR_SYMBOLS, type Operator } from "./Operator";

/** One entry of the expression as typed: an operator, or a number's text ("2.50", "-3", "10%"). */
type Term = Operator | string;

/** What the engine showed before a key was pressed; the key's effect is read from the engine afterwards. */
interface Before {
  readonly phase: CalculatorPhase;
  readonly shown: string;
}

/**
 * The NORMAL calculator: the existing CalculatorEngine, plus the expression the user has entered.
 *
 * The engine alone decides every number, so left-to-right evaluation, percent and error rules stay exactly as
 * they were. This class never calculates: it forwards each key to the engine, then writes down what that key
 * did to the expression ("2 + 3 × 4", "200 + 10%", "7 +" and so on), using what the engine displays.
 * It knows nothing about the DOM.
 */
export class NormalCalculator implements BasicCalculator {
  private terms: Term[] = [];
  /** True after "=": the expression is complete and its result is on the display. */
  private finished = false;

  constructor(private readonly engine: CalculatorEngine = new CalculatorEngine()) {}

  /** The value of the calculation so far (left to right); a lone number is shown exactly as typed. */
  get displayValue(): string {
    return this.engine.previewValue;
  }

  /** The expression so far, in the notation of PRO's line: "2 + 3 × 4", and "2 + 3 × 4 =" once finished. */
  get expressionText(): string {
    const text = this.terms.map((term) => (isOperator(term) ? OPERATOR_SYMBOLS[term] : withMinusSign(term))).join(" ");

    return this.finished && text !== "" ? `${text} =` : text;
  }

  clear(): void {
    this.engine.clear();
    this.terms = [];
    this.finished = false;
  }

  inputDigit(digit: string): void {
    const before = this.observe();
    this.engine.inputDigit(digit);
    this.recordEntry(before);
  }

  inputDecimal(): void {
    const before = this.observe();
    this.engine.inputDecimal();
    this.recordEntry(before);
  }

  toggleSign(): void {
    const before = this.observe();
    this.engine.toggleSign();
    if (this.engine.displayValue === before.shown) return; // nothing was negated

    if (before.phase === "result") this.startFrom(this.engine.displayValue);
    else this.replaceLast(toggleMinus(this.terms.at(-1) ?? before.shown));
  }

  percent(): void {
    const before = this.observe();
    this.engine.percent();

    if (before.phase === "result") this.startFrom(`${before.shown}%`);
    else if (before.phase === "entering") this.replaceLast(`${this.operandTerm(before)}%`);
  }

  setOperator(operator: Operator): void {
    const before = this.observe();
    this.engine.setOperator(operator);
    if (before.phase === "error") return; // the engine ignores operators in error

    if (before.phase === "result") this.startFrom(before.shown);
    else if (this.isLastAnOperator()) this.terms.pop();
    else if (this.terms.length === 0) this.terms.push(before.shown); // the 0 on the display is the first operand
    this.terms.push(operator);
  }

  equals(): void {
    const before = this.observe();
    this.engine.equals();

    const calculated = (before.phase === "entering" || before.phase === "awaitingOperand") && this.terms.some(isOperator);
    if (!calculated) return;

    // After an operator with no second operand, the engine used the displayed number again (7 + = is 7 + 7).
    if (this.isLastAnOperator()) this.terms.push(before.shown);
    this.finished = true;
  }

  private observe(): Before {
    return { phase: this.engine.phase, shown: this.engine.displayValue };
  }

  /** A digit or decimal point: the number on the display is now the typed text, so it replaces the last number. */
  private recordEntry(before: Before): void {
    if (before.phase === "result" || before.phase === "error") this.startFrom();

    if (this.isLastAnOperator() || this.terms.length === 0) this.terms.push(this.engine.displayValue);
    else this.replaceLast(this.engine.displayValue);
  }

  /** Starts a new expression, optionally with its first number. */
  private startFrom(first?: string): void {
    this.terms = first === undefined ? [] : [first];
    this.finished = false;
  }

  private replaceLast(term: string): void {
    if (this.terms.length === 0) this.terms.push(term);
    else this.terms[this.terms.length - 1] = term;
  }

  private isLastAnOperator(): boolean {
    const last = this.terms.at(-1);
    return last !== undefined && isOperator(last);
  }

  /** The number the next key works on: the last entered one, or the 0 on the display for an untouched calculator. */
  private operandTerm(before: Before): string {
    return this.terms.length === 0 ? before.shown : (this.terms.at(-1) as string);
  }
}

const withMinusSign = (text: string): string =>
  text.startsWith("-") ? OPERATOR_SYMBOLS.subtract + text.slice(1) : text;

const toggleMinus = (text: string): string => (text.startsWith("-") ? text.slice(1) : `-${text}`);
