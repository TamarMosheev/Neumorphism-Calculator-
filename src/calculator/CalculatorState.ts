import { negateText } from "./NumberEntry";
import { formatNumber } from "./NumberFormatter";
import type { Operator } from "./Operator";

export { countDigits } from "./NumberEntry";

/** A number the user is typing (exact text), or one the calculator computed (full precision). */
export type Operand =
  | { readonly kind: "typed"; readonly text: string }
  | { readonly kind: "computed"; readonly value: number };

/** An operator waiting for its second operand. */
export interface PendingOperation {
  readonly operator: Operator;
  readonly firstOperand: number;
}

/**
 * Every state the calculator can be in. Each state carries exactly the data it needs,
 * so combinations that make no sense (a result with a pending operator) cannot be built.
 */
export type CalculatorState =
  /** The user is typing the current operand (the first, or the second when `pending` is set). */
  | { readonly kind: "entering"; readonly operand: Operand; readonly pending: PendingOperation | null }
  /** An operator was pressed; the next digit starts the second operand. `operand` is still displayed. */
  | { readonly kind: "awaitingOperand"; readonly operand: Operand; readonly pending: PendingOperation }
  /** `=` finished a calculation. */
  | { readonly kind: "result"; readonly value: number }
  | { readonly kind: "error" };

export type CalculatorPhase = CalculatorState["kind"];

export const ERROR_TEXT = "Error";

export const typed = (text: string): Operand => ({ kind: "typed", text });
export const computed = (value: number): Operand => ({ kind: "computed", value });

export const INITIAL_STATE: CalculatorState = {
  kind: "entering",
  operand: typed("0"),
  pending: null,
};

export const ERROR_STATE: CalculatorState = { kind: "error" };

export function operandText(operand: Operand): string {
  return operand.kind === "typed" ? operand.text : formatNumber(operand.value);
}

export function operandNumber(operand: Operand): number {
  return operand.kind === "typed" ? Number(operand.text) : operand.value;
}

export function negate(operand: Operand): Operand {
  if (operand.kind === "computed") return computed(-operand.value);

  return typed(negateText(operand.text));
}

export function displayTextOf(state: CalculatorState): string {
  switch (state.kind) {
    case "entering":
    case "awaitingOperand":
      return operandText(state.operand);
    case "result":
      return formatNumber(state.value);
    case "error":
      return ERROR_TEXT;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled calculator state: ${JSON.stringify(value)}`);
}
