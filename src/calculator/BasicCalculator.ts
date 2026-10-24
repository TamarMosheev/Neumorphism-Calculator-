import type { Operator } from "./Operator";

/** The basic-keypad operations every calculator engine (NORMAL and PRO) offers, so the app can drive either one. */
export interface BasicCalculator {
  readonly displayValue: string;
  /** The expression entered so far, as shown above the value ("2 + 3 × 4", and "2 + 3 × 4 =" once finished). */
  readonly expressionText: string;
  clear(): void;
  inputDigit(digit: string): void;
  inputDecimal(): void;
  toggleSign(): void;
  percent(): void;
  setOperator(operator: Operator): void;
  equals(): void;
}
