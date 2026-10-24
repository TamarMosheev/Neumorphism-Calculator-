import { calculate, type Operator } from "../Operator";
import type { ExpressionToken } from "./ExpressionToken";

/**
 * Why an expression could not be evaluated.
 *   syntax: the tokens are not a well-formed expression (empty, unbalanced, misplaced operator, ...).
 *   math:   the expression is well formed but has no finite real value (÷ 0, √ of a negative, overflow).
 */
export type EvaluationFailure = "syntax" | "math";

export type EvaluationResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly failure: EvaluationFailure };

/** Deepest nesting of parentheses, √ and leading minus signs; protects the call stack from absurd input. */
export const MAX_NESTING_DEPTH = 100;

const ADDITIVE: readonly Operator[] = ["add", "subtract"];
const MULTIPLICATIVE: readonly Operator[] = ["multiply", "divide"];
const NEGATION: readonly Operator[] = ["subtract"];

/**
 * Marks a math failure (÷ 0, √ of a negative, overflow). It propagates through every later operation,
 * so the whole expression is still checked for syntax first and a syntax failure always wins.
 * It can only come from arithmetic: number tokens that are not finite are rejected as syntax errors.
 */
const MATH_FAILURE = Number.NaN;

/**
 * Evaluates a PRO expression with standard precedence. Pure and stateless: no DOM, no eval,
 * and the same tokens always give the same result.
 *
 * Grammar (lowest to highest precedence), implemented by recursive descent:
 *
 *   expression := term    (("+" | "-") term)*
 *   term       := unary   (("×" | "÷") unary)*
 *   unary      := "-" unary | postfix                 leading minus; -3² is -(3²)
 *   postfix    := primary "²"*                        x² binds tighter than × and unary minus
 *   primary    := number | "(" expression ")" | "√" primary
 *
 * Strictness: invalid input is reported, never repaired. A missing ")", a trailing operator or a
 * unary "+" is a syntax failure, and so is a missing operator between operands (2(3), 2√9);
 * inserting the × for implicit multiplication is the job of whatever builds the tokens.
 * √ takes the primary right after it, so √9² is (√9)².
 */
export class ExpressionEvaluator {
  evaluate(tokens: readonly ExpressionToken[]): EvaluationResult {
    try {
      const value = new Parser(tokens).parse();
      if (Number.isNaN(value)) return { ok: false, failure: "math" };

      // -x and x * 0 can produce -0; callers should only ever see 0.
      return { ok: true, value: value === 0 ? 0 : value };
    } catch (error) {
      if (error instanceof MalformedExpression) return { ok: false, failure: "syntax" };
      throw error;
    }
  }
}

class MalformedExpression extends Error {}

const malformed = (): never => {
  throw new MalformedExpression("malformed expression");
};

/** Parses and evaluates in one pass; one instance per evaluation, so evaluations never share state. */
class Parser {
  private position = 0;
  private depth = 0;

  constructor(private readonly tokens: readonly ExpressionToken[]) {}

  parse(): number {
    const value = this.expression();
    // Anything left over is misplaced: a stray ")", or an operand with no operator before it.
    if (this.position < this.tokens.length) return malformed();

    return value;
  }

  private expression(): number {
    return this.binary(ADDITIVE, () => this.term());
  }

  private term(): number {
    return this.binary(MULTIPLICATIVE, () => this.unary());
  }

  /** One precedence level: operand (operator operand)*, evaluated left to right. */
  private binary(operators: readonly Operator[], operand: () => number): number {
    let left = operand();

    for (let operator = this.matchOperator(operators); operator !== null; operator = this.matchOperator(operators)) {
      left = calculate(operator, left, operand()) ?? MATH_FAILURE;
    }
    return left;
  }

  private unary(): number {
    if (this.matchOperator(NEGATION) === null) return this.postfix();

    return -this.nested(() => this.unary());
  }

  private postfix(): number {
    let value = this.primary();

    while (this.tokens.at(this.position)?.kind === "square") {
      this.position++;
      const squared = value * value;
      value = Number.isFinite(squared) ? squared : MATH_FAILURE;
    }
    return value;
  }

  private primary(): number {
    const token = this.tokens.at(this.position++);

    switch (token?.kind) {
      case "number":
        return Number.isFinite(token.value) ? token.value : malformed();

      case "open": {
        const value = this.nested(() => this.expression());
        return this.tokens.at(this.position++)?.kind === "close" ? value : malformed();
      }

      case "squareRoot": {
        const radicand = this.nested(() => this.primary());
        return radicand >= 0 ? Math.sqrt(radicand) : MATH_FAILURE;
      }

      default:
        // End of input, a misplaced operator, ")" or "²", or a token this evaluator does not know.
        return malformed();
    }
  }

  /** The matching operator among `allowed`, consumed; otherwise null (including for unknown operators). */
  private matchOperator(allowed: readonly Operator[]): Operator | null {
    const token = this.tokens.at(this.position);
    if (token?.kind !== "operator" || !allowed.includes(token.operator)) return null;

    this.position++;
    return token.operator;
  }

  private nested<T>(parse: () => T): T {
    if (++this.depth > MAX_NESTING_DEPTH) malformed();

    try {
      return parse();
    } finally {
      this.depth--;
    }
  }
}
