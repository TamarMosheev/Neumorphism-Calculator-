import type { Operator } from "../Operator";

/**
 * One element of a PRO expression, in the order the user entered it.
 *
 * Tokens come straight from button presses, so there is no text to parse.
 * A negative number can arrive two ways, which mean different things:
 *   - a negative literal  { number, -3 } is one atomic value, so (-3)² is 9;
 *   - a leading minus     [subtract, 3]  negates what follows, so -3² is -9.
 */
export type ExpressionToken =
  /**
   * `text` is the number as the user typed it ("2.00", "5."). It is only a display hint so the expression
   * can be shown faithfully; evaluation always uses `value`, and a text that does not match it is ignored.
   */
  | { readonly kind: "number"; readonly value: number; readonly text?: string }
  | { readonly kind: "operator"; readonly operator: Operator }
  | { readonly kind: "open" }
  | { readonly kind: "close" }
  /** Postfix x², applies to the value before it. */
  | { readonly kind: "square" }
  /** Prefix √, applies to the number, group or √ that follows. */
  | { readonly kind: "squareRoot" };

/** A minus is a sign (unary), not a subtraction, when it starts the expression or follows an operator, "(" or √. */
const SIGN_POSITION_AFTER: ReadonlySet<string> = new Set(["operator", "open", "squareRoot"]);

export function isSignMinus(tokens: readonly ExpressionToken[], index: number): boolean {
  const token = tokens.at(index);
  if (index < 0 || token?.kind !== "operator" || token.operator !== "subtract") return false;

  return index === 0 || SIGN_POSITION_AFTER.has(tokens.at(index - 1)?.kind ?? "");
}

export const numberToken = (value: number, text?: string): ExpressionToken =>
  text === undefined ? { kind: "number", value } : { kind: "number", value, text };
export const operatorToken = (operator: Operator): ExpressionToken => ({ kind: "operator", operator });

export const OPEN_PARENTHESIS: ExpressionToken = { kind: "open" };
export const CLOSE_PARENTHESIS: ExpressionToken = { kind: "close" };
export const SQUARE: ExpressionToken = { kind: "square" };
export const SQUARE_ROOT: ExpressionToken = { kind: "squareRoot" };
