import { describe, expect, it } from "vitest";
import { formatNumber } from "../NumberFormatter";
import { calculate, type Operator } from "../Operator";
import evaluatorSource from "./ExpressionEvaluator.ts?raw";
import { ExpressionEvaluator, MAX_NESTING_DEPTH, type EvaluationResult } from "./ExpressionEvaluator";
import {
  CLOSE_PARENTHESIS,
  OPEN_PARENTHESIS,
  SQUARE,
  SQUARE_ROOT,
  numberToken,
  operatorToken,
  type ExpressionToken,
} from "./ExpressionToken";
import tokenSource from "./ExpressionToken.ts?raw";

// ---------------------------------------------------------------- helpers (test-only)

const OPERATOR_SYMBOLS: Record<string, Operator> = {
  "+": "add",
  "-": "subtract",
  "−": "subtract",
  "×": "multiply",
  "*": "multiply",
  "÷": "divide",
  "/": "divide",
};

/** Turns readable text such as "(2 + 3) × 4" into tokens. Spaces are ignored. */
function tokens(text: string): ExpressionToken[] {
  return [...text.matchAll(/\d+(?:\.\d+)?|[()²√+\-−×*÷/]/g)].map(([piece]): ExpressionToken => {
    if (/^\d/.test(piece)) return numberToken(Number(piece));
    if (piece === "(") return OPEN_PARENTHESIS;
    if (piece === ")") return CLOSE_PARENTHESIS;
    if (piece === "²") return SQUARE;
    if (piece === "√") return SQUARE_ROOT;
    return operatorToken(OPERATOR_SYMBOLS[piece]!);
  });
}

const evaluator = new ExpressionEvaluator();
const evaluate = (text: string): EvaluationResult => evaluator.evaluate(tokens(text));

function valueOf(text: string): number {
  const result = evaluate(text);
  if (!result.ok) throw new Error(`"${text}" failed with a ${result.failure} failure`);
  return result.value;
}

const failureOf = (text: string): string => {
  const result = evaluate(text);
  return result.ok ? `ok:${result.value}` : result.failure;
};

/** Small deterministic generator (mulberry32) so any failure is reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the examples from the requirements

describe("required examples", () => {
  it.each([
    ["2 + 3 × 4", 14],
    ["(2 + 3) × 4", 20],
    ["(-3)²", 9],
    ["√81", 9],
    ["√(9 + 16)", 5],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });
});

describe("precedence and associativity", () => {
  it.each([
    ["2 + 3 × 4", 14],
    ["2 × 3 + 4", 10],
    ["2 + 6 ÷ 3", 4],
    ["2 × 3 + 4 × 5", 26],
    ["2 − 3 × 4 + 5", -5],
    ["12 ÷ 4 − 1", 2],
    ["10 − 4 − 3", 3],
    ["100 ÷ 10 ÷ 2", 5],
    ["18 ÷ 3 ÷ 3", 2],
    ["8 ÷ 2 × 4", 16],
    ["2 × 3 × 4", 24],
    ["1 + 2 + 3", 6],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });

  it("differs from the NORMAL calculator, which evaluates left to right (2 + 3 × 4 is 20 there)", () => {
    expect(valueOf("2 + 3 × 4")).toBe(14);
  });

  it.each([
    ["7", 7],
    ["0", 0],
    ["0.5 + 0.25", 0.75],
    ["1.5 × 4", 6],
    ["10 − 20", -10],
    ["123456789012345 + 1", 123456789012346],
    ["123456789012345 × 10", 1234567890123450],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });
});

describe("parentheses", () => {
  it.each([
    ["((2 + 3))", 5],
    ["(2 + 3) × (4 + 5)", 45],
    ["2 × (3 + (4 × 5))", 46],
    ["((((1))))", 1],
    ["(1 + 2) × (3 + 4) × (5 + 6)", 231],
    ["10 − (2 + 3)", 5],
    ["10 − (2 − 3)", 11],
    ["100 ÷ (2 × 5)", 10],
    ["(8 ÷ 2) ÷ 2", 2],
    ["8 ÷ (2 ÷ 2)", 8],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });
});

describe("unary minus", () => {
  it.each([
    ["-3", -3],
    ["-3 + 5", 2],
    ["5 + -3", 2],
    ["5 − -3", 8],
    ["2 × -3", -6],
    ["-6 ÷ -3", 2],
    ["-2 × -3", 6],
    ["-(2 + 3)", -5],
    ["2 × -(3 + 4)", -14],
    ["--3", 3],
    ["---3", -3],
    ["-(-(-2))", -2],
    ["-√9", -3],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });

  it("applies to the squared value: -3² is -(3²)", () => {
    expect(valueOf("-3²")).toBe(-9);
    expect(valueOf("-(3²)")).toBe(-9);
  });

  it("needs parentheses to be squared: (-3)² is 9", () => {
    expect(valueOf("(-3)²")).toBe(9);
  });

  describe("negative number literals (from the +/- key)", () => {
    it("are one atomic value", () => {
      expect(evaluator.evaluate([numberToken(-3)])).toEqual({ ok: true, value: -3 });
      expect(evaluator.evaluate([numberToken(-3), SQUARE])).toEqual({ ok: true, value: 9 });
    });

    it("work as operands", () => {
      const twoTimesMinusThree = [numberToken(2), operatorToken("multiply"), numberToken(-3)];
      expect(evaluator.evaluate(twoTimesMinusThree)).toEqual({ ok: true, value: -6 });

      const minusThreeMinusMinusThree = [numberToken(-3), operatorToken("subtract"), numberToken(-3)];
      expect(evaluator.evaluate(minusThreeMinusMinusThree)).toEqual({ ok: true, value: 0 });
    });

    it("keep the leading-minus form different: [-, 3, ²] is -9 but [-3, ²] is 9", () => {
      expect(valueOf("-3²")).not.toBe(evaluator.evaluate([numberToken(-3), SQUARE]).ok ? 9 : NaN);
    });

    it("a negative literal under √ is a math failure", () => {
      expect(evaluator.evaluate([SQUARE_ROOT, numberToken(-4)])).toEqual({ ok: false, failure: "math" });
    });
  });

  it("never produces negative zero", () => {
    for (const text of ["-0", "0 × -5", "-0 × 3", "-(0)", "0 ÷ -4", "--0"]) {
      expect(Object.is(valueOf(text), 0), text).toBe(true);
    }
    const literalNegativeZero = evaluator.evaluate([numberToken(-0)]);
    expect(literalNegativeZero.ok && Object.is(literalNegativeZero.value, 0)).toBe(true);
  });
});

describe("squaring", () => {
  it.each([
    ["3²", 9],
    ["(2 + 3)²", 25],
    ["2²²", 16],
    ["2 × 3²", 18],
    ["3² + 4²", 25],
    ["2 + 3² × 2", 20],
    ["0.5²", 0.25],
    ["10²²", 10000],
    ["(1 + 1)² × 3", 12],
    ["√(2 + 7) × (1 + 1)²", 12],
    ["2² + 3² ÷ 3", 7],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });

  it("binds tighter than multiplication", () => {
    expect(valueOf("2 × 3²")).toBe(18);
    expect(valueOf("(2 × 3)²")).toBe(36);
  });
});

describe("square roots", () => {
  it.each([
    ["√81", 9],
    ["√(9 + 16)", 5],
    ["√0", 0],
    ["√1", 1],
    ["√0.25", 0.5],
    ["√√16", 2],
    ["√(√(√256))", 2],
    ["√(√16 + 5)", 3],
    ["√(2²)", 2],
    ["√(3² + 4²)", 5],
    ["√(100 ÷ 4) × 2", 10],
    ["2 × √9", 6],
    ["√9 × 2", 6],
    ["√16 + √9", 7],
    ["-√16 + 10", 6],
    ["(1 + 2)² − √16", 5],
  ])("%s = %d", (text, expected) => {
    expect(valueOf(text)).toBe(expected);
  });

  it("takes the number or group right after it, so √9² is (√9)²", () => {
    expect(valueOf("√9²")).toBe(9);
    expect(valueOf("√16²")).toBe(16);
    expect(valueOf("(√16)²")).toBe(16);
    expect(valueOf("√(16²)")).toBe(16);
  });

  it("returns the double nearest to the true root", () => {
    expect(valueOf("√2")).toBe(Math.SQRT2);
  });
});

// ---------------------------------------------------------------- failures

describe("math failures (well-formed, but no finite real value)", () => {
  it.each([
    ["1 ÷ 0"],
    ["0 ÷ 0"],
    ["-1 ÷ 0"],
    ["1 ÷ (2 − 2)"],
    ["2 + 3 ÷ 0 × 4"],
    ["(1 ÷ 0)²"],
    ["√(1 ÷ 0)"],
    ["√(-4)"],
    ["√(0 − 1)"],
    ["√(2 − 3)"],
    ["√(-(4))"],
  ])("%s", (text) => {
    expect(failureOf(text)).toBe("math");
  });

  it("is not hidden by multiplying by zero: 0 × (1 ÷ 0) is a failure, not 0", () => {
    expect(failureOf("0 × (1 ÷ 0)")).toBe("math");
    expect(failureOf("(1 ÷ 0) − (1 ÷ 0)")).toBe("math");
    expect(failureOf("0 × √(-1)")).toBe("math");
  });

  it("treats rounding residue as zero, so dividing by it is a division by zero", () => {
    // 0.1 + 0.2 - 0.3 is 5.55e-17 in binary floating point; the shared Operator rules settle it to 0
    expect(failureOf("5 ÷ (0.1 + 0.2 − 0.3)")).toBe("math");
  });

  describe("overflow to infinity", () => {
    it("through multiplication", () => {
      const huge = [numberToken(1e300), operatorToken("multiply"), numberToken(1e300)];
      expect(evaluator.evaluate(huge)).toEqual({ ok: false, failure: "math" });
    });

    it("through squaring", () => {
      expect(evaluator.evaluate([numberToken(1e200), SQUARE])).toEqual({ ok: false, failure: "math" });
    });

    it("through repeated squaring", () => {
      expect(evaluator.evaluate([numberToken(10), SQUARE, SQUARE, SQUARE, SQUARE, SQUARE, SQUARE, SQUARE, SQUARE, SQUARE])).toEqual({
        ok: false,
        failure: "math",
      });
    });

    it("through addition", () => {
      const sum = [numberToken(1.7e308), operatorToken("add"), numberToken(1.7e308)];
      expect(evaluator.evaluate(sum)).toEqual({ ok: false, failure: "math" });
    });
  });
});

describe("syntax failures (malformed expressions)", () => {
  it.each([
    ["", "empty expression"],
    ["()", "empty parentheses"],
    ["(", "lone opening parenthesis"],
    [")", "lone closing parenthesis"],
    [")(", "reversed parentheses"],
    ["(2 + 3", "missing closing parenthesis"],
    ["((2)", "missing closing parenthesis, nested"],
    ["2 + 3)", "extra closing parenthesis"],
    ["2 +", "trailing operator"],
    ["2 −", "trailing minus"],
    ["2 × -", "trailing unary minus"],
    ["-", "lone minus"],
    ["+ 2", "leading plus (unary plus is not supported)"],
    ["× 2", "leading multiplication"],
    ["÷ 2", "leading division"],
    ["2 × × 3", "two operators in a row"],
    ["2 + × 3", "plus then times"],
    ["2 3", "two numbers with no operator"],
    ["2 (3)", "no implicit multiplication before a group"],
    ["(2)(3)", "no implicit multiplication between groups"],
    ["(2) 3", "no implicit multiplication after a group"],
    ["2 √ 3", "no implicit multiplication before √"],
    ["√ 4 3", "number after a root"],
    ["2²3", "number after a square"],
    ["²", "lone square"],
    ["² 2", "square before a number"],
    ["2 + ²", "square after an operator"],
    ["√", "lone root"],
    ["√ ×", "root of an operator"],
    ["√²", "root of a square"],
    ["√-4", "leading minus directly after √ (write √(-4))"],
    ["2 + (", "open group at the end"],
  ])("%j (%s)", (text) => {
    expect(failureOf(text)).toBe("syntax");
  });

  it("is reported before any math failure, wherever the malformed part is", () => {
    expect(failureOf("1 ÷ 0 +")).toBe("syntax");
    expect(failureOf("(1 ÷ 0")).toBe("syntax");
    expect(failureOf("√(0 − 1) 2")).toBe("syntax");
    expect(failureOf("1 ÷ 0 + )")).toBe("syntax");
    expect(failureOf("√(0 − 1) +")).toBe("syntax");
  });
});

describe("invalid tokens", () => {
  const syntax = { ok: false, failure: "syntax" };

  it.each([[NaN], [Infinity], [-Infinity]])("number token %s is a syntax failure", (value) => {
    expect(evaluator.evaluate([numberToken(value)])).toEqual(syntax);
    expect(evaluator.evaluate([numberToken(1), operatorToken("add"), numberToken(value)])).toEqual(syntax);
  });

  it("an unknown token kind is a syntax failure", () => {
    const bogus = { kind: "bogus" } as unknown as ExpressionToken;
    expect(evaluator.evaluate([bogus])).toEqual(syntax);
    expect(evaluator.evaluate([numberToken(1), bogus])).toEqual(syntax);
    expect(evaluator.evaluate([bogus, numberToken(1)])).toEqual(syntax);
  });

  it("an unknown operator is a syntax failure, never a TypeError", () => {
    const modulo = { kind: "operator", operator: "modulo" } as unknown as ExpressionToken;
    expect(() => evaluator.evaluate([numberToken(5), modulo, numberToken(2)])).not.toThrow();
    expect(evaluator.evaluate([numberToken(5), modulo, numberToken(2)])).toEqual(syntax);
    expect(evaluator.evaluate([modulo, numberToken(2)])).toEqual(syntax);
  });

  it("null and undefined entries are a syntax failure", () => {
    expect(evaluator.evaluate([null as unknown as ExpressionToken])).toEqual(syntax);
    expect(evaluator.evaluate([numberToken(1), undefined as unknown as ExpressionToken])).toEqual(syntax);
  });

  it("an operator token without an operator is a syntax failure", () => {
    const noOperator = { kind: "operator" } as unknown as ExpressionToken;
    expect(evaluator.evaluate([numberToken(1), noOperator, numberToken(2)])).toEqual(syntax);
  });
});

// ---------------------------------------------------------------- precision

describe("precision", () => {
  it("returns the raw double; display rounding belongs to NumberFormatter", () => {
    const result = evaluate("0.1 + 0.2");
    expect(result.ok && result.value).toBe(0.1 + 0.2);
    expect(result.ok && formatNumber(result.value)).toBe("0.3");
  });

  it.each([
    ["0.1 + 0.2 − 0.3"],
    ["1.1 − 1 − 0.1"],
    ["(√2)² − 2"],
    ["(√3)² − 3"],
  ])("settles cancellation noise to exactly 0: %s", (text) => {
    expect(valueOf(text)).toBe(0);
  });

  it("keeps 1 ÷ 3 × 3 exactly 1 (no rounding of intermediate results)", () => {
    expect(valueOf("1 ÷ 3 × 3")).toBe(1);
    expect(valueOf("2 ÷ 3 × 3")).toBe(2);
    expect(valueOf("1 ÷ 7 × 7")).toBe(1);
  });

  it("(√2)² is within one rounding step of 2", () => {
    expect(valueOf("(√2)²")).toBeCloseTo(2, 14);
  });

  it("keeps full precision through repeated squares and roots", () => {
    // √(√(√(2²)²)²): √(2²) = 2, squared 4, √ gives 2, squared 4, √ gives 2
    expect(valueOf("√(√(√(2²)²)²)")).toBe(2);
    expect(valueOf("((√2)²)²")).toBeCloseTo(4, 13);
    expect(valueOf("(1 + 2)² × (1 + 2)²")).toBe(81);
  });

  it("is exact for integers up to 2^53", () => {
    expect(valueOf("9007199254740991 ÷ 1")).toBe(Number.MAX_SAFE_INTEGER);
    expect(valueOf("94906265²")).toBe(94906265 * 94906265);
  });
});

describe("consistency with the NORMAL calculator's arithmetic", () => {
  const VALUES = [0, 1, -1, 2, 3, 7, 10, 0.1, 0.2, 0.3, 2.5, -3.75, 100, 1e154, 1e-200, 1e300, 123456789012345];
  const OPERATORS: Operator[] = ["add", "subtract", "multiply", "divide"];

  it("gives the same result as Operator.calculate for every single operation", () => {
    for (const operator of OPERATORS) {
      for (const left of VALUES) {
        for (const right of VALUES) {
          const result = evaluator.evaluate([numberToken(left), operatorToken(operator), numberToken(right)]);
          const expected = calculate(operator, left, right);

          if (expected === null) {
            expect(result, `${left} ${operator} ${right}`).toEqual({ ok: false, failure: "math" });
          } else {
            expect(result, `${left} ${operator} ${right}`).toEqual({ ok: true, value: expected === 0 ? 0 : expected });
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------- robustness

describe("robustness", () => {
  it("evaluates a very long flat expression without recursion", () => {
    expect(valueOf(`1${"+1".repeat(10000)}`)).toBe(10001);
    expect(valueOf(`2${"×1".repeat(10000)}`)).toBe(2);
  });

  describe("nesting depth limit", () => {
    const nested = (levels: number): ExpressionToken[] => [
      ...Array<ExpressionToken>(levels).fill(OPEN_PARENTHESIS),
      numberToken(1),
      ...Array<ExpressionToken>(levels).fill(CLOSE_PARENTHESIS),
    ];

    it(`allows ${MAX_NESTING_DEPTH} nested parentheses`, () => {
      expect(evaluator.evaluate(nested(MAX_NESTING_DEPTH))).toEqual({ ok: true, value: 1 });
    });

    it(`rejects ${MAX_NESTING_DEPTH + 1} nested parentheses as a syntax failure`, () => {
      expect(evaluator.evaluate(nested(MAX_NESTING_DEPTH + 1))).toEqual({ ok: false, failure: "syntax" });
    });

    it("survives absurd nesting without overflowing the stack", () => {
      expect(() => evaluator.evaluate(nested(100000))).not.toThrow();
      expect(evaluator.evaluate(nested(100000))).toEqual({ ok: false, failure: "syntax" });
    });

    it("applies to chained minus signs and roots too", () => {
      expect(valueOf(`${"-".repeat(MAX_NESTING_DEPTH)}1`)).toBe(1);
      expect(failureOf(`${"-".repeat(MAX_NESTING_DEPTH + 1)}1`)).toBe("syntax");
      expect(valueOf(`${"√".repeat(50)}1`)).toBe(1);
      expect(failureOf(`${"√".repeat(MAX_NESTING_DEPTH + 1)}1`)).toBe("syntax");
    });

    it("recovers after a rejected expression", () => {
      evaluator.evaluate(nested(MAX_NESTING_DEPTH + 50));
      expect(valueOf("2 + 3")).toBe(5);
    });
  });

  it("does not modify the tokens it is given", () => {
    const input = Object.freeze(tokens("(2 + 3) × √16 − 4²").map((token) => Object.freeze({ ...token })));
    expect(() => evaluator.evaluate(input)).not.toThrow();
    expect(evaluator.evaluate(input)).toEqual({ ok: true, value: 4 });
  });

  it("is stateless: results do not depend on earlier calls", () => {
    expect(evaluate("2 + 3")).toEqual({ ok: true, value: 5 });
    expect(evaluate("(2 +")).toEqual({ ok: false, failure: "syntax" });
    expect(evaluate("1 ÷ 0")).toEqual({ ok: false, failure: "math" });
    expect(evaluate("2 + 3")).toEqual({ ok: true, value: 5 });
    expect(new ExpressionEvaluator().evaluate(tokens("2 + 3"))).toEqual({ ok: true, value: 5 });
  });

  it("never throws, and only ever returns finite numbers or a failure, on random token sequences", () => {
    const random = seeded(20261022);
    const pool: ExpressionToken[] = [
      numberToken(0), numberToken(1), numberToken(2), numberToken(3), numberToken(9), numberToken(0.5), numberToken(-4),
      operatorToken("add"), operatorToken("subtract"), operatorToken("multiply"), operatorToken("divide"),
      OPEN_PARENTHESIS, CLOSE_PARENTHESIS, SQUARE, SQUARE_ROOT,
    ];
    const seen = { ok: 0, syntax: 0, math: 0 };

    for (let sequence = 0; sequence < 30000; sequence++) {
      const length = Math.floor(random() * 15);
      const input = Array.from({ length }, () => pool[Math.floor(random() * pool.length)]!);

      const result = evaluator.evaluate(input);
      if (result.ok) {
        // Asserted only on a violation: tens of thousands of passing expect() calls cost seconds.
        if (!Number.isFinite(result.value)) expect(Number.isFinite(result.value)).toBe(true);
        if (Object.is(result.value, -0)) expect(Object.is(result.value, -0)).toBe(false);
        seen.ok++;
      } else {
        seen[result.failure]++;
      }
    }
    // the fuzz really exercised every outcome
    expect(seen.ok).toBeGreaterThan(100);
    expect(seen.syntax).toBeGreaterThan(100);
    expect(seen.math).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------- independent oracle

/**
 * Random expression TREES are evaluated directly, and also written out as tokens with the minimum
 * parentheses the standard precedence rules require. The evaluator must reconstruct the same value
 * from the flat tokens, which checks precedence, associativity and parentheses independently.
 */
describe("agreement with direct tree evaluation", () => {
  type Tree =
    | { type: "number"; value: number }
    | { type: "binary"; operator: Operator; left: Tree; right: Tree }
    | { type: "negate"; operand: Tree }
    | { type: "square"; operand: Tree }
    | { type: "root"; operand: Tree };

  const PRECEDENCE: Record<Operator, number> = { add: 1, subtract: 1, multiply: 2, divide: 2 };
  const NUMBERS = [0, 1, 2, 3, 4, 5, 7, 9, 10, 0.5, 2.5, 12, 100];
  const OPERATORS: Operator[] = ["add", "subtract", "multiply", "divide"];

  function randomTree(random: () => number, depth: number): Tree {
    const roll = random();
    if (depth === 0 || roll < 0.25) return { type: "number", value: NUMBERS[Math.floor(random() * NUMBERS.length)]! };
    if (roll < 0.75) {
      return {
        type: "binary",
        operator: OPERATORS[Math.floor(random() * OPERATORS.length)]!,
        left: randomTree(random, depth - 1),
        right: randomTree(random, depth - 1),
      };
    }
    const type = (["negate", "square", "root"] as const)[Math.floor(random() * 3)]!;
    return { type, operand: randomTree(random, depth - 1) };
  }

  /** The tree's value, or null when any step has no finite real value. */
  function evaluateTree(tree: Tree): number | null {
    switch (tree.type) {
      case "number":
        return tree.value;
      case "binary": {
        const left = evaluateTree(tree.left);
        const right = evaluateTree(tree.right);
        return left === null || right === null ? null : calculate(tree.operator, left, right);
      }
      case "negate": {
        const value = evaluateTree(tree.operand);
        return value === null ? null : -value;
      }
      case "square": {
        const value = evaluateTree(tree.operand);
        return value === null || !Number.isFinite(value * value) ? null : value * value;
      }
      case "root": {
        const value = evaluateTree(tree.operand);
        return value === null || value < 0 ? null : Math.sqrt(value);
      }
    }
  }

  const isAtom = (tree: Tree): boolean => tree.type === "number" || tree.type === "root";

  const group = (inner: ExpressionToken[]): ExpressionToken[] => [OPEN_PARENTHESIS, ...inner, CLOSE_PARENTHESIS];

  function serialize(tree: Tree): ExpressionToken[] {
    switch (tree.type) {
      case "number":
        return [numberToken(tree.value)];

      case "binary": {
        const own = PRECEDENCE[tree.operator];
        const left = serialize(tree.left);
        const right = serialize(tree.right);
        const leftNeedsGroup = tree.left.type === "binary" && PRECEDENCE[tree.left.operator] < own;
        // operators are left-associative, so an equal-precedence right operand must be grouped
        const rightNeedsGroup = tree.right.type === "binary" && PRECEDENCE[tree.right.operator] <= own;
        return [
          ...(leftNeedsGroup ? group(left) : left),
          operatorToken(tree.operator),
          ...(rightNeedsGroup ? group(right) : right),
        ];
      }

      case "negate": {
        // a leading minus applies to a term: anything looser than that, or an inner minus chain, still works as written
        const operand = serialize(tree.operand);
        const needsGroup = tree.operand.type === "binary";
        return [operatorToken("subtract"), ...(needsGroup ? group(operand) : operand)];
      }

      case "square": {
        // x² applies to a primary only: negations and binary expressions must be grouped
        const operand = serialize(tree.operand);
        return [...(isAtom(tree.operand) && tree.operand.type === "number" ? operand : group(operand)), SQUARE];
      }

      case "root": {
        const operand = serialize(tree.operand);
        return [SQUARE_ROOT, ...(tree.operand.type === "number" || tree.operand.type === "root" ? operand : group(operand))];
      }
    }
  }

  it("matches the tree value on 8000 random expressions", () => {
    const random = seeded(7);
    const agreed = { value: 0, failure: 0 };

    for (let index = 0; index < 8000; index++) {
      const tree = randomTree(random, 4);
      const expected = evaluateTree(tree);
      const result = evaluator.evaluate(serialize(tree));

      if (expected === null) {
        expect(result, `expression #${index}`).toEqual({ ok: false, failure: "math" });
        agreed.failure++;
      } else {
        expect(result, `expression #${index}`).toEqual({ ok: true, value: expected === 0 ? 0 : expected });
        agreed.value++;
      }
    }
    expect(agreed.value).toBeGreaterThan(2000);
    expect(agreed.failure).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------- architecture guards

describe("independence", () => {
  const sources = { "ExpressionEvaluator.ts": evaluatorSource, "ExpressionToken.ts": tokenSource };

  it.each(Object.entries(sources))("%s has no eval, Function constructor or DOM access", (_name, source) => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/\beval\s*\(/);
    expect(code).not.toMatch(/\bnew\s+Function\b/);
    expect(code).not.toMatch(/\bFunction\s*\(/);
    for (const global of ["document", "window", "navigator", "localStorage", "HTMLElement"]) {
      expect(code, global).not.toMatch(new RegExp(`\\b${global}\\b`));
    }
  });

  it("imports only the shared Operator module and its own token model", () => {
    const imported = (source: string): string[] =>
      [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!).sort();

    expect(imported(evaluatorSource)).toEqual(["../Operator", "./ExpressionToken"]);
    expect(imported(tokenSource)).toEqual(["../Operator"]);
  });

  it("does not depend on the NORMAL calculator's engine or state", () => {
    for (const source of Object.values(sources)) {
      expect(source).not.toMatch(/CalculatorEngine|CalculatorState|InputHandler|CalculatorUI|ThemeManager/);
    }
  });
});
