import type { BasicCalculator } from "../BasicCalculator";
import { appendDecimal, appendDigit, negateText } from "../NumberEntry";
import { formatNumber } from "../NumberFormatter";
import { resolvePercent, type Operator } from "../Operator";
import { ExpressionEvaluator, MAX_NESTING_DEPTH } from "./ExpressionEvaluator";
import { ExpressionFormatter } from "./ExpressionFormatter";
import {
  CLOSE_PARENTHESIS,
  OPEN_PARENTHESIS,
  SQUARE,
  SQUARE_ROOT,
  isSignMinus,
  numberToken,
  operatorToken,
  type ExpressionToken,
} from "./ExpressionToken";

export type ProPhase = "building" | "result" | "error";

type Tokens = readonly ExpressionToken[];

/** The number being entered: typed digit by digit, or a value the calculator produced (by %). */
type Entry =
  | { readonly kind: "typed"; readonly text: string }
  | { readonly kind: "computed"; readonly value: number };

type BuildingState = { readonly kind: "building"; readonly tokens: Tokens; readonly entry: Entry | null };

/**
 * `building`: an expression is being put together (`tokens`, plus the number still being typed in `entry`).
 * `result`:   `=` evaluated it. `error`: evaluation failed; the tokens are kept so the expression can be shown.
 */
type ProState =
  | BuildingState
  | { readonly kind: "result"; readonly tokens: Tokens; readonly value: number }
  | { readonly kind: "error"; readonly tokens: Tokens };

/** Same text as the NORMAL calculator shows. */
const ERROR_TEXT = "Error";
const MULTIPLY = operatorToken("multiply");
/** A leading minus is the same token as a subtraction; its position decides which it is (see isSignMinus). */
const NEGATE = operatorToken("subtract");

/** After one of these, a new operand cannot follow directly: the multiplication is implied. */
const OPERAND_ENDINGS: ReadonlySet<string> = new Set(["number", "close", "square"]);

/** An expression ending in one of these is waiting for its next operand. */
const UNFINISHED_ENDINGS: ReadonlySet<string> = new Set(["operator", "open", "squareRoot"]);

/**
 * The PRO calculator: turns key presses into expression tokens and evaluates them with standard precedence.
 * Calculation is delegated to ExpressionEvaluator and text to ExpressionFormatter; number typing and the
 * percent rule are the same shared code NORMAL uses. It holds no reference to the NORMAL engine.
 *
 * Key presses can never build a malformed expression: a key that would break the grammar (")" with nothing
 * to close, an operator right after "(") is ignored, and an operand that follows a finished operand gets a
 * visible × in between ("2(3)" becomes 2 × (3)). What cannot be prevented, because it is merely unfinished
 * ("2 +", "(2 + 3"), is reported by "=" as an error and never repaired.
 */
export class ProCalculator implements BasicCalculator {
  private state: ProState = emptyExpression();

  constructor(
    private readonly evaluator: ExpressionEvaluator = new ExpressionEvaluator(),
    private readonly formatter: ExpressionFormatter = new ExpressionFormatter(),
  ) {}

  get phase(): ProPhase {
    return this.state.kind;
  }

  /**
   * What the large display shows: the value of the expression so far (updated live, before "="), the result
   * after "=", or "Error". A lone number being typed shows exactly as typed ("5.", "0.50").
   */
  get displayValue(): string {
    const state = this.state;

    switch (state.kind) {
      case "error":
        return ERROR_TEXT;
      case "result":
        return formatNumber(state.value);
      case "building":
        return state.entry !== null && state.tokens.length === 0
          ? entryText(state.entry)
          : this.currentValue(withEntry(state));
    }
  }

  /** The whole expression, including the number being typed; after "=" it ends with " =". */
  get expressionText(): string {
    const state = this.state;

    switch (state.kind) {
      case "building":
        return this.formatter.format(withEntry(state));
      case "result":
        return `${this.formatter.format(state.tokens)} =`;
      case "error":
        return this.formatter.format(state.tokens);
    }
  }

  clear(): void {
    this.state = emptyExpression();
  }

  inputDigit(digit: string): void {
    this.enterNumber((text) => appendDigit(text, digit));
  }

  inputDecimal(): void {
    this.enterNumber(appendDecimal);
  }

  setOperator(operator: Operator): void {
    const state = this.state;
    if (state.kind === "error") return;

    // After "=" the result is carried on, as in NORMAL.
    if (state.kind === "result") {
      this.state = building([numberToken(state.value), operatorToken(operator)]);
      return;
    }

    const tokens = withEntry(state);
    const last = tokens.at(-1);

    if (operator === "subtract" && canStartSign(tokens)) {
      // Where an operand is expected, "−" is a sign: -(5 + 3), 5 × -(2 + 3), (-3 + 1).
      this.state = building([...tokens, NEGATE]);
    } else if (last === undefined) {
      // Nothing entered yet: the 0 on the display is the first operand, as in NORMAL.
      this.state = building([numberToken(0, "0"), operatorToken(operator)]);
    } else if (last.kind === "operator" && isSignMinus(tokens, tokens.length - 1)) {
      // After a sign: "−" again changes nothing. Another operator replaces the operator the sign followed
      // (5 × − then + is 5 +); a sign at the start of a group has no operator to replace, so it is ignored.
      if (operator !== "subtract" && tokens.at(-2)?.kind === "operator") {
        this.state = building([...tokens.slice(0, -2), operatorToken(operator)]);
      }
    } else if (last.kind === "operator") {
      this.state = building([...tokens.slice(0, -1), operatorToken(operator)]);
    } else if (endsOperand(tokens)) {
      this.state = building([...tokens, operatorToken(operator)]);
    }
    // after "(" or √ there is nothing for an operator to work on: ignored
  }

  openParenthesis(): void {
    const tokens = this.tokensForNewOperand();
    if (nestingCost(tokens) >= MAX_NESTING_DEPTH) return;

    this.state = building([...beforeNewOperand(tokens), OPEN_PARENTHESIS]);
  }

  closeParenthesis(): void {
    const state = this.state;
    if (state.kind !== "building") return;

    const tokens = withEntry(state);
    if (!endsOperand(tokens) || unmatchedOpenings(tokens) === 0) return;

    this.state = building([...tokens, CLOSE_PARENTHESIS]);
  }

  /** Squares what was just entered: the number, the finished group, or the result. */
  square(): void {
    const state = this.state;
    if (state.kind === "error") return;

    if (state.kind === "result") {
      this.state = building([numberToken(state.value), SQUARE]);
      return;
    }

    const tokens = withEntry(state);
    if (endsOperand(tokens)) this.state = building([...tokens, SQUARE]);
  }

  /**
   * With a number entered (or a result on screen) the root is taken of that number: 81 then √ is √81.
   * Without one, √ opens a new radicand and the next digits go under it: √ then 81 is √81.
   * After a finished operand it multiplies: (9 + 16) then √ starts × √.
   */
  squareRoot(): void {
    const state = this.state;
    if (state.kind === "error") return;

    if (state.kind === "result") {
      this.state = building([SQUARE_ROOT, numberToken(state.value)]);
      return;
    }

    if (nestingCost(state.tokens) >= MAX_NESTING_DEPTH) return;

    this.state =
      state.entry !== null
        ? building([...state.tokens, SQUARE_ROOT, entryToken(state.entry)])
        : building([...beforeNewOperand(state.tokens), SQUARE_ROOT]);
  }

  toggleSign(): void {
    const state = this.state;

    if (state.kind === "result") {
      if (state.value !== 0) this.state = building([], { kind: "computed", value: -state.value });
      return;
    }

    if (state.kind === "building" && state.entry === null) return this.toggleSignOfPending(state.tokens);

    // Nothing to negate without a number, and zero stays zero.
    if (state.kind !== "building" || state.entry === null || entryValue(state.entry) === 0) return;

    const entry = state.entry;
    this.state = building(
      state.tokens,
      entry.kind === "typed" ? { kind: "typed", text: negateText(entry.text) } : { kind: "computed", value: -entry.value },
    );
  }

  /**
   * Turns the number being entered into its percentage, exactly as NORMAL does (resolvePercent):
   * after + or − it is that share of everything to the left of the operator in the current group,
   * otherwise a plain fraction. 200 + 10 % becomes 200 + 20, 200 × 10 % becomes 200 × 0.1.
   */
  percent(): void {
    const state = this.state;

    if (state.kind === "result") {
      this.state = building([], { kind: "computed", value: resolvePercent(null, null, state.value) });
      return;
    }
    if (state.kind !== "building" || state.entry === null) return;

    const last = state.tokens.at(-1);
    const operator = last?.kind === "operator" ? last.operator : null;
    let base: number | null = null;

    if (operator === "add" || operator === "subtract") {
      const evaluation = this.evaluator.evaluate(groupBefore(state.tokens, state.tokens.length - 1));
      if (!evaluation.ok) return this.fail(state);
      base = evaluation.value;
    }

    const value = resolvePercent(operator, base, entryValue(state.entry));
    if (!Number.isFinite(value)) return this.fail(state);

    this.state = building(state.tokens, { kind: "computed", value });
  }

  /** Evaluates the expression as entered. An unfinished one (a trailing operator, an open group) is an error. */
  equals(): void {
    const state = this.state;
    if (state.kind !== "building") return;

    const tokens = withEntry(state);
    if (tokens.length === 0) return;

    const evaluation = this.evaluator.evaluate(tokens);
    this.state = evaluation.ok ? { kind: "result", tokens, value: evaluation.value } : { kind: "error", tokens };
  }

  /**
   * +/− with no number being typed negates a finished parenthesized group, with the same leading minus the
   * "−" key makes: (5 + 3) becomes -(5 + 3), and pressed again becomes (5 + 3). With no group just finished
   * there is nothing to negate (the "−" key is how a sign is entered before an operand).
   */
  private toggleSignOfPending(tokens: Tokens): void {
    if (tokens.at(-1)?.kind !== "close") return;

    const start = groupStart(tokens);
    if (start < 0) return;

    if (isSignMinus(tokens, start - 1)) {
      this.state = building([...tokens.slice(0, start - 1), ...tokens.slice(start)]);
    } else if (tokens.at(start - 1)?.kind !== "squareRoot" && nestingCost(tokens) < MAX_NESTING_DEPTH) {
      // (a sign cannot follow a √, which takes its group directly: √(…) stays as it is)
      this.state = building([...tokens.slice(0, start), NEGATE, ...tokens.slice(start)]);
    }
  }

  private fail(state: BuildingState): void {
    this.state = { kind: "error", tokens: withEntry(state) };
  }

  /** Where a typed number goes and what it extends; "" starts a new number. */
  private enterNumber(extend: (text: string) => string | null): void {
    const state = this.state;
    let tokens: Tokens = [];
    let text = "";

    if (state.kind === "building") {
      if (state.entry?.kind === "typed") {
        tokens = state.tokens;
        text = state.entry.text;
      } else {
        // a computed number (from %) is replaced by typing; after a finished operand, the × is implied
        tokens = state.entry === null ? beforeNewOperand(state.tokens) : state.tokens;
      }
    }

    const next = extend(text);
    if (next !== null) this.state = building(tokens, { kind: "typed", text: next });
  }

  /** The tokens a "(" extends: a new expression after "=" or an error, else the current one. */
  private tokensForNewOperand(): Tokens {
    return this.state.kind === "building" ? withEntry(this.state) : [];
  }

  /**
   * The live preview: the value of the expression so far, without its unfinished tail ("5 +" previews 5).
   * Groups still open are closed in a local copy only, so "(5 + 3" previews 8 while the stored tokens stay as typed.
   * Read-only: it evaluates copies and never touches the state.
   */
  private currentValue(tokens: Tokens): string {
    let end = tokens.length;
    while (end > 0 && UNFINISHED_ENDINGS.has(tokens[end - 1]?.kind ?? "")) end--;

    const finished = tokens.slice(0, end);
    if (finished.length === 0) return "0";

    const closings = Array.from({ length: unmatchedOpenings(finished) }, () => CLOSE_PARENTHESIS);
    const evaluation = this.evaluator.evaluate([...finished, ...closings]);
    if (evaluation.ok) return formatNumber(evaluation.value);

    // a math failure (5 ÷ 0, √ of a negative): "=" reports it, the preview keeps the last number entered
    for (let index = finished.length - 1; index >= 0; index--) {
      const token = finished[index];
      if (token?.kind === "number") return token.text ?? formatNumber(token.value);
    }
    return "0";
  }
}

function emptyExpression(): ProState {
  return building([]);
}

function building(tokens: Tokens, entry: Entry | null = null): ProState {
  return { kind: "building", tokens, entry };
}

function entryValue(entry: Entry): number {
  return entry.kind === "typed" ? Number(entry.text) : entry.value;
}

/** The entry as shown on the main line (ASCII minus, like NORMAL). */
function entryText(entry: Entry): string {
  return entry.kind === "typed" ? entry.text : formatNumber(entry.value);
}

function entryToken(entry: Entry): ExpressionToken {
  return entry.kind === "typed" ? numberToken(Number(entry.text), entry.text) : numberToken(entry.value);
}

/** The expression's tokens with the number being entered added as the last one. */
function withEntry(state: BuildingState): Tokens {
  return state.entry === null ? state.tokens : [...state.tokens, entryToken(state.entry)];
}

function endsOperand(tokens: Tokens): boolean {
  return OPERAND_ENDINGS.has(tokens.at(-1)?.kind ?? "");
}

/** Makes room for a new operand: a finished operand before it implies a multiplication. */
function beforeNewOperand(tokens: Tokens): Tokens {
  return endsOperand(tokens) ? [...tokens, MULTIPLY] : tokens;
}

/** True when a new operand is expected, no sign has been entered for it yet, and there is room to nest one. */
function canStartSign(tokens: Tokens): boolean {
  const last = tokens.at(-1);
  const operandExpected = last === undefined || last.kind === "open" || last.kind === "operator";

  return operandExpected && !isSignMinus(tokens, tokens.length - 1) && nestingCost(tokens) < MAX_NESTING_DEPTH;
}

/** Index of the "(" that the final ")" closes; -1 when there is none. */
function groupStart(tokens: Tokens): number {
  let depth = 0;

  for (let index = tokens.length - 1; index >= 0; index--) {
    const kind = tokens[index]?.kind;
    if (kind === "close") depth++;
    else if (kind === "open" && --depth === 0) return index;
  }
  return -1;
}

function unmatchedOpenings(tokens: Tokens): number {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "open") depth++;
    else if (token.kind === "close") depth--;
  }
  return Math.max(depth, 0);
}

/**
 * How deeply the evaluator would have to nest: every open group, every √ and every sign (counted whether
 * or not it is finished, which is safely more than needed). Staying under MAX_NESTING_DEPTH means the
 * evaluator never gives up on an expression the keys were allowed to build.
 */
function nestingCost(tokens: Tokens): number {
  const signs = tokens.filter((_token, index) => isSignMinus(tokens, index)).length;

  return unmatchedOpenings(tokens) + tokens.filter((token) => token.kind === "squareRoot").length + signs;
}

/** The tokens of the current parenthesis group that lie before `end` (the whole expression outside any group). */
function groupBefore(tokens: Tokens, end: number): Tokens {
  let depth = 0;

  for (let index = end - 1; index >= 0; index--) {
    const kind = tokens[index]?.kind;
    if (kind === "close") depth++;
    else if (kind === "open") {
      if (depth === 0) return tokens.slice(index + 1, end);
      depth--;
    }
  }
  return tokens.slice(0, end);
}
