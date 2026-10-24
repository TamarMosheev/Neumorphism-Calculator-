export type Operator = "add" | "subtract" | "multiply" | "divide";

/**
 * A sum or difference this small compared with its operands is binary rounding residue
 * (0.1 + 0.2 - 0.3 = 5.55e-17), not a real value: operands of at most 15 significant digits
 * cannot differ by less than about 1e-15 of their size, so anything below 4 * EPSILON is noise.
 */
const CANCELLATION_NOISE = 4 * Number.EPSILON;

function settleCancellation(result: number, left: number, right: number): number {
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(result) <= CANCELLATION_NOISE * scale ? 0 : result;
}

/** How each operator is written in an expression line. Shared by NORMAL and PRO so both read the same. */
export const OPERATOR_SYMBOLS: Record<Operator, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

export const OPERATIONS: Record<Operator, (left: number, right: number) => number> = {
  add: (left, right) => settleCancellation(left + right, left, right),
  subtract: (left, right) => settleCancellation(left - right, left, right),
  multiply: (left, right) => left * right,
  divide: (left, right) => left / right,
};

/**
 * Resolves "value%" typed as the second operand.
 * After + or - it is a share of the first operand (200 + 10% -> 200 + 20);
 * otherwise it is a plain fraction (200 x 10% -> 200 x 0.1, standalone 50% -> 0.5).
 */
export function resolvePercent(
  operator: Operator | null,
  firstOperand: number | null,
  value: number,
): number {
  const fraction = value / 100;
  const isRelative = operator === "add" || operator === "subtract";

  return isRelative && firstOperand !== null ? firstOperand * fraction : fraction;
}

/** Applies an operator; null when the result is not a finite number (division by zero, overflow). */
export function calculate(operator: Operator, left: number, right: number): number | null {
  const result = OPERATIONS[operator](left, right);
  return Number.isFinite(result) ? result : null;
}

export function isOperator(value: string | undefined): value is Operator {
  return value !== undefined && Object.hasOwn(OPERATIONS, value);
}
