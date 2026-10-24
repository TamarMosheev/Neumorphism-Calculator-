import { formatNumber } from "../NumberFormatter";
import { OPERATOR_SYMBOLS } from "../Operator";
import { isSignMinus, type ExpressionToken } from "./ExpressionToken";

type NumberToken = Extract<ExpressionToken, { readonly kind: "number" }>;

const MINUS = OPERATOR_SYMBOLS.subtract;
/** Shown for anything that is not a token this formatter knows, so nothing disappears silently. */
const UNKNOWN = "?";

/** Digits with an optional leading minus and an optional decimal point, as NumberEntry produces ("2.00", "5.", "-3"). */
const TYPED_NUMBER = /^-?\d+(?:\.\d*)?$/;

/**
 * Writes PRO tokens as readable text for the expression line, using + − × ÷ ( ) ² √.
 * Pure and stateless: it never evaluates, reorders, repairs or drops anything, so an incomplete or
 * invalid expression is shown exactly as entered ("2 +", "(2 + 3", "2 3").
 *
 * The text keeps the meaning the evaluator gives the tokens:
 *   - a minus used as a sign has no space after it, a subtraction has spaces on both sides ("2 − 3" and "2 −3");
 *   - a negative number literal gets parentheses where a bare "−" would read differently:
 *     (−3)² is 9 but −3² is −9, and √(−4) is a negative root but √−4 is malformed.
 */
export class ExpressionFormatter {
  format(tokens: readonly ExpressionToken[]): string {
    return tokens.map((_token, index) => this.gapBefore(tokens, index) + this.symbolAt(tokens, index)).join("");
  }

  /** Tokens are separated by one space, except where they belong together: "(2", "2)", "x²", "√9", "−3". */
  private gapBefore(tokens: readonly ExpressionToken[], index: number): string {
    if (index === 0) return "";

    const previous = tokens.at(index - 1)?.kind;
    const current = tokens.at(index)?.kind;
    const joined =
      previous === "open" ||
      previous === "squareRoot" ||
      current === "close" ||
      current === "square" ||
      isSignMinus(tokens, index - 1);

    return joined ? "" : " ";
  }

  private symbolAt(tokens: readonly ExpressionToken[], index: number): string {
    const token = tokens.at(index);

    switch (token?.kind) {
      case "number":
        return this.numberAt(tokens, index, token);
      case "operator":
        return OPERATOR_SYMBOLS[token.operator] ?? UNKNOWN;
      case "open":
        return "(";
      case "close":
        return ")";
      case "square":
        return "²";
      case "squareRoot":
        return "√";
      default:
        return UNKNOWN;
    }
  }

  private numberAt(tokens: readonly ExpressionToken[], index: number, token: NumberToken): string {
    const text = numberText(token);
    // The first token has no predecessor (tokens.at(-1) would wrap around to the last one).
    const before = index > 0 ? tokens.at(index - 1)?.kind : undefined;
    const needsParentheses = text.startsWith(MINUS) && (tokens.at(index + 1)?.kind === "square" || before === "squareRoot");

    return needsParentheses ? `(${text})` : text;
  }

}

/** The number as typed when that is a faithful spelling of its value, otherwise the shared display format. */
function numberText(token: NumberToken): string {
  const { value, text } = token;
  if (typeof value !== "number") return UNKNOWN;

  const shown = typeof text === "string" && TYPED_NUMBER.test(text) && Number(text) === value ? text : formatNumber(value);
  return shown.startsWith("-") ? MINUS + shown.slice(1) : shown;
}
