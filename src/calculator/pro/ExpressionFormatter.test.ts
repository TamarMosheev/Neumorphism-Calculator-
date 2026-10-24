import { describe, expect, it } from "vitest";
import { formatNumber } from "../NumberFormatter";
import type { Operator } from "../Operator";
import { ExpressionEvaluator } from "./ExpressionEvaluator";
import { ExpressionFormatter } from "./ExpressionFormatter";
import formatterSource from "./ExpressionFormatter.ts?raw";
import {
  CLOSE_PARENTHESIS as CLOSE,
  OPEN_PARENTHESIS as OPEN,
  SQUARE,
  SQUARE_ROOT as ROOT,
  numberToken as n,
  operatorToken,
  type ExpressionToken,
} from "./ExpressionToken";

// ---------------------------------------------------------------- helpers (test-only)

const ADD = operatorToken("add");
const SUB = operatorToken("subtract");
const MUL = operatorToken("multiply");
const DIV = operatorToken("divide");

const SYMBOL_OPERATORS: Record<string, Operator> = {
  "+": "add",
  "-": "subtract",
  "−": "subtract",
  "×": "multiply",
  "*": "multiply",
  "÷": "divide",
  "/": "divide",
};

/** Turns readable text such as "(2 + 3) × 4" into tokens (a "-" is always the operator token). Spaces are ignored. */
function tokens(text: string): ExpressionToken[] {
  return [...text.matchAll(/\d+(?:\.\d+)?|[()²√+\-−×*÷/]/g)].map(([piece]): ExpressionToken => {
    if (/^\d/.test(piece)) return n(Number(piece));
    if (piece === "(") return OPEN;
    if (piece === ")") return CLOSE;
    if (piece === "²") return SQUARE;
    if (piece === "√") return ROOT;
    return operatorToken(SYMBOL_OPERATORS[piece]!);
  });
}

/** Reads formatted text back into tokens: every "−" is the operator token, numbers are plain values. */
function reparse(text: string): ExpressionToken[] {
  return [...text.matchAll(/\d+(?:\.\d*)?(?:e[+-]?\d+)?|[()²√+−×÷]/g)].map(([piece]): ExpressionToken => {
    if (/^\d/.test(piece)) return n(Number(piece));
    if (piece === "(") return OPEN;
    if (piece === ")") return CLOSE;
    if (piece === "²") return SQUARE;
    if (piece === "√") return ROOT;
    return operatorToken(SYMBOL_OPERATORS[piece]!);
  });
}

/** Cheap structural check for the property loops; a mismatch is always re-asserted with toEqual for the report. */
const sameTokens = (a: readonly ExpressionToken[], b: readonly ExpressionToken[]): boolean => JSON.stringify(a) === JSON.stringify(b);

const formatter = new ExpressionFormatter();
const evaluator = new ExpressionEvaluator();
const format = (list: readonly ExpressionToken[]): string => formatter.format(list);
const show = (text: string): string => format(tokens(text));

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

// ---------------------------------------------------------------- formatting

describe("basic arithmetic", () => {
  it.each([
    ["2+3", "2 + 3"],
    ["2-3", "2 − 3"],
    ["2*3", "2 × 3"],
    ["2/3", "2 ÷ 3"],
    ["2+3*4-5/6", "2 + 3 × 4 − 5 ÷ 6"],
    ["10-4-3", "10 − 4 − 3"],
    ["2.5*4", "2.5 × 4"],
    ["7", "7"],
    ["0", "0"],
  ])("%s -> %s", (input, expected) => {
    expect(show(input)).toBe(expected);
  });

  it("uses the mathematical symbols, not the keyboard ones", () => {
    expect(format([n(1), SUB, n(2), MUL, n(3), DIV, n(4)])).toBe("1 − 2 × 3 ÷ 4");
    expect(format([n(1), SUB, n(2)])).toContain("−");
    expect(format([n(1), SUB, n(2)])).not.toContain("-");
  });

  it("spaces tokens consistently whatever the source text looked like", () => {
    expect(show("2   +3*  4")).toBe("2 + 3 × 4");
  });
});

describe("parentheses and nesting", () => {
  it.each([
    ["(2+3)*4", "(2 + 3) × 4"],
    ["((1+2)*(3+4))", "((1 + 2) × (3 + 4))"],
    ["2*(3+(4*5))", "2 × (3 + (4 × 5))"],
    ["(((1)))", "(((1)))"],
    ["10-(2-3)", "10 − (2 − 3)"],
    ["(8/2)/2", "(8 ÷ 2) ÷ 2"],
  ])("%s -> %s", (input, expected) => {
    expect(show(input)).toBe(expected);
  });

  it("keeps parentheses tight against their contents", () => {
    expect(format([OPEN, n(2), CLOSE])).toBe("(2)");
  });
});

describe("squaring and square roots", () => {
  it.each([
    ["3²", "3²"],
    ["(2+3)²", "(2 + 3)²"],
    ["2²²", "2²²"],
    ["2*3²", "2 × 3²"],
    ["3²+4²", "3² + 4²"],
    ["√81", "√81"],
    ["√(9+16)", "√(9 + 16)"],
    ["√√16", "√√16"],
    ["√9²", "√9²"],
    ["(√16)²", "(√16)²"],
    ["√(2²)", "√(2²)"],
    ["√16+√9", "√16 + √9"],
    ["2*√9", "2 × √9"],
    ["√(100/4)*2", "√(100 ÷ 4) × 2"],
  ])("%s -> %s", (input, expected) => {
    expect(show(input)).toBe(expected);
  });
});

describe("negative numbers", () => {
  describe("a minus used as a sign (leading minus)", () => {
    it.each([
      ["-3", "−3"],
      ["-3+5", "−3 + 5"],
      ["5+-3", "5 + −3"],
      ["5--3", "5 − −3"],
      ["2*-3", "2 × −3"],
      ["-(2+3)", "−(2 + 3)"],
      ["2*-(3+4)", "2 × −(3 + 4)"],
      ["--3", "−−3"],
      ["---3", "−−−3"],
      ["-√9", "−√9"],
      ["-3²", "−3²"],
      ["(-3)²", "(−3)²"],
      ["√-4", "√−4"],
      ["√(-4)", "√(−4)"],
    ])("%s -> %s", (input, expected) => {
      expect(show(input)).toBe(expected);
    });

    it("has no space after the sign but spaces around a subtraction", () => {
      expect(format([n(2), SUB, n(3)])).toBe("2 − 3");
      expect(format([SUB, n(3)])).toBe("−3");
      expect(format([n(2), MUL, SUB, n(3)])).toBe("2 × −3");
      expect(format([OPEN, SUB, n(3), CLOSE])).toBe("(−3)");
    });
  });

  describe("negative number literals (the +/- key)", () => {
    it.each<[string, ExpressionToken[], string]>([
      ["alone", [n(-3)], "−3"],
      ["as the second operand", [n(2), MUL, n(-3)], "2 × −3"],
      ["as the first operand", [n(-3), ADD, n(5)], "−3 + 5"],
      ["subtracted from itself", [n(-3), SUB, n(-3)], "−3 − −3"],
      ["a negative decimal", [n(-0.5), ADD, n(1)], "−0.5 + 1"],
      ["inside parentheses", [OPEN, n(-3), CLOSE], "(−3)"],
    ])("%s", (_label, input, expected) => {
      expect(format(input)).toBe(expected);
    });

    describe("get parentheses where a bare minus would change the meaning", () => {
      it.each<[string, ExpressionToken[], string]>([
        ["before ²", [n(-3), SQUARE], "(−3)²"],
        ["before repeated ²", [n(-3), SQUARE, SQUARE], "(−3)²²"],
        ["a negative decimal before ²", [n(-0.5), SQUARE], "(−0.5)²"],
        ["a typed negative decimal before ²", [n(-3.5, "-3.50"), SQUARE], "(−3.50)²"],
        ["after √", [ROOT, n(-4)], "√(−4)"],
        ["after repeated √", [ROOT, ROOT, n(-4)], "√√(−4)"],
        ["between √ and ²", [ROOT, n(-4), SQUARE], "√(−4)²"],
        ["after a leading minus, before ²", [SUB, n(-3), SQUARE], "−(−3)²"],
      ])("%s", (_label, input, expected) => {
        expect(format(input)).toBe(expected);
      });

      it("only when needed: positive numbers and unrelated negatives stay bare", () => {
        expect(format([ROOT, n(4)])).toBe("√4");
        expect(format([n(3), SQUARE])).toBe("3²");
        expect(format([n(-3), MUL, n(2)])).toBe("−3 × 2");
      });
    });

    it("shows (−3)² and −3² differently, and they really are 9 and −9", () => {
      const literal = [n(-3), SQUARE];
      const leadingMinus = [SUB, n(3), SQUARE];

      expect(format(literal)).toBe("(−3)²");
      expect(format(leadingMinus)).toBe("−3²");
      expect(evaluator.evaluate(literal)).toEqual({ ok: true, value: 9 });
      expect(evaluator.evaluate(leadingMinus)).toEqual({ ok: true, value: -9 });
    });

    it("shows √(−4) (a negative root) differently from √−4 (malformed)", () => {
      const literal = [ROOT, n(-4)];
      const leadingMinus = [ROOT, SUB, n(4)];

      expect(format(literal)).toBe("√(−4)");
      expect(format(leadingMinus)).toBe("√−4");
      expect(evaluator.evaluate(literal)).toEqual({ ok: false, failure: "math" });
      expect(evaluator.evaluate(leadingMinus)).toEqual({ ok: false, failure: "syntax" });
    });

    it("does not let the last token affect the first (no wrap-around)", () => {
      expect(format([n(-4), MUL, ROOT])).toBe("−4 × √");
      expect(format([n(-4), ADD, ROOT])).toBe("−4 + √");
    });

    it("shows a number that is missing its operator as it is: 2 −3 is not 2 − 3", () => {
      expect(format([n(2), n(-3)])).toBe("2 −3");
      expect(format([n(2), SUB, n(3)])).toBe("2 − 3");
    });
  });

  it("keeps a negative exponent's own hyphen but uses the minus sign for the number's sign", () => {
    expect(format([n(1e-7)])).toBe("1e-7");
    expect(format([n(-1e-7)])).toBe("−1e-7");
    expect(format([n(-99999999980000000000)])).toBe("−9.999999998e+19");
  });
});

describe("number text", () => {
  describe("typed text is kept when it spells the value", () => {
    it.each([
      [2, "2.00", "2.00"],
      [0.5, "0.50", "0.50"],
      [12.5, "12.50", "12.50"],
      [5, "5.", "5."],
      [0, "0.", "0."],
      [0, "0.0", "0.0"],
      [0, "0.000", "0.000"],
      [100, "100", "100"],
      [3, "3", "3"],
      [-2, "-2.00", "−2.00"],
      [-5, "-5.", "−5."],
    ])("value %s typed as %j is shown as %j", (value, text, expected) => {
      expect(format([n(value, text)])).toBe(expected);
    });

    it("inside an expression", () => {
      expect(format([n(2.5, "2.50"), MUL, n(4, "4.0")])).toBe("2.50 × 4.0");
      expect(format([OPEN, n(1, "1."), ADD, n(2, "2.00"), CLOSE, SQUARE])).toBe("(1. + 2.00)²");
    });
  });

  describe("typed text that does not spell the value is ignored, never shown", () => {
    it.each([
      [7, "5", "7"],
      [7, "abc", "7"],
      [7, "", "7"],
      [5, " 5", "5"],
      [5, "5 ", "5"],
      [5, "+5", "5"],
      [5000, "5e3", "5000"],
      [0.3, "0.30000000000000004", "0.3"],
      [1, "1.2.3", "1"],
      [1, "-", "1"],
      [1, ".", "1"],
    ])("value %s with text %j is shown as %j", (value, text, expected) => {
      expect(format([n(value, text)])).toBe(expected);
    });
  });

  describe("without typed text, the shared NumberFormatter decides", () => {
    const VALUES = [0, 1, -1, 0.5, -0.5, 2.25, 0.1 + 0.2, 1 / 3, 123456789012345, -123456789012345, Number.MAX_SAFE_INTEGER, 1e21, -1e21, 1e-7, 99999999980000000000];

    it.each(VALUES)("%s", (value) => {
      const expected = formatNumber(value);
      expect(format([n(value)])).toBe(expected.startsWith("-") ? `−${expected.slice(1)}` : expected);
    });

    it("removes binary noise and rounds like the display does", () => {
      expect(format([n(0.1 + 0.2)])).toBe("0.3");
      expect(format([n(1 / 3)])).toBe("0.333333333333333");
    });
  });

  it("shows non-finite values as they are, for the evaluator to reject", () => {
    expect(format([n(NaN)])).toBe("NaN");
    expect(format([n(Infinity)])).toBe("Infinity");
    expect(format([n(-Infinity)])).toBe("−Infinity");
  });
});

describe("empty and incomplete expressions", () => {
  it("formats nothing as an empty string", () => {
    expect(format([])).toBe("");
  });

  it.each<[string, ExpressionToken[], string]>([
    ["an opening parenthesis", [OPEN], "("],
    ["a closing parenthesis", [CLOSE], ")"],
    ["empty parentheses", [OPEN, CLOSE], "()"],
    ["a trailing operator", [n(2), ADD], "2 +"],
    ["a trailing minus", [n(2), SUB], "2 −"],
    ["an operator then a group", [n(2), ADD, OPEN], "2 + ("],
    ["an unclosed group", [OPEN, n(2), ADD], "(2 +"],
    ["nested unclosed groups", [OPEN, OPEN, n(2)], "((2"],
    ["a lone root", [ROOT], "√"],
    ["a root then a group", [ROOT, OPEN], "√("],
    ["a lone sign", [SUB], "−"],
    ["a sign after an operator", [n(2), MUL, SUB], "2 × −"],
    ["two signs", [SUB, SUB], "−−"],
    ["a lone square", [SQUARE], "²"],
    ["a square after an operator (² always attaches to what precedes it)", [n(2), ADD, SQUARE], "2 +²"],
    ["repeated squares", [n(2), SQUARE, SQUARE], "2²²"],
    ["a leading operator", [ADD, n(2)], "+ 2"],
    ["a lone times", [MUL], "×"],
    ["an operator before a closing parenthesis", [n(2), ADD, CLOSE], "2 +)"],
  ])("%s", (_label, input, expected) => {
    expect(format(input)).toBe(expected);
  });

  it("never leaves a trailing or leading space", () => {
    for (const input of [[n(2), ADD], [ADD], [OPEN], [n(2), MUL, SUB], [ROOT], [n(1), SUB]]) {
      const text = format(input);
      expect(text, JSON.stringify(input)).toBe(text.trim());
    }
  });
});

describe("faithfulness: nothing is evaluated, repaired or hidden", () => {
  it("does not evaluate", () => {
    expect(format([n(2), ADD, n(3)])).toBe("2 + 3");
    expect(format([n(1), DIV, n(0)])).toBe("1 ÷ 0");
    expect(format([ROOT, n(-4)])).toBe("√(−4)");
  });

  it.each<[string, ExpressionToken[], string]>([
    ["a missing closing parenthesis", [OPEN, n(2), ADD, n(3)], "(2 + 3"],
    ["an extra closing parenthesis", [n(2), ADD, n(3), CLOSE], "2 + 3)"],
    ["two numbers with no operator", [n(2), n(3)], "2 3"],
    ["a group right after a number", [n(2), OPEN, n(3), CLOSE], "2 (3)"],
    ["two groups side by side", [OPEN, n(2), CLOSE, OPEN, n(3), CLOSE], "(2) (3)"],
    ["a root right after a number", [n(2), ROOT, n(3)], "2 √3"],
    ["a number after a square", [n(2), SQUARE, n(3)], "2² 3"],
    ["two operators in a row", [n(2), MUL, MUL, n(3)], "2 × × 3"],
    ["reversed parentheses", [CLOSE, OPEN], ") ("],
  ])("does not repair %s", (_label, input, expected) => {
    expect(format(input)).toBe(expected);
  });

  it("does not change the tokens it is given", () => {
    const original = tokens("(2 + 3) × √16 − 4²");
    const frozen = Object.freeze(original.map((token) => Object.freeze({ ...token })));
    const snapshot = JSON.stringify(frozen);

    expect(() => format(frozen)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(snapshot);
    expect(format(frozen)).toBe("(2 + 3) × √16 − 4²");
  });

  it("is stateless: the same tokens always give the same text", () => {
    const input = tokens("(1+2)*3");
    expect(format(input)).toBe(format(input));
    expect(new ExpressionFormatter().format(input)).toBe(format(input));
    format(tokens("2+"));
    expect(format(input)).toBe("(1 + 2) × 3");
  });
});

describe("invalid tokens are shown as ?, never thrown on", () => {
  const bogus = { kind: "bogus" } as unknown as ExpressionToken;
  const modulo = { kind: "operator", operator: "modulo" } as unknown as ExpressionToken;
  const noOperator = { kind: "operator" } as unknown as ExpressionToken;
  const stringValue = { kind: "number", value: "x" } as unknown as ExpressionToken;
  const numericText = { kind: "number", value: 1, text: 5 } as unknown as ExpressionToken;

  it("handles each kind of junk", () => {
    expect(format([bogus])).toBe("?");
    expect(format([n(1), bogus])).toBe("1 ?");
    expect(format([null as unknown as ExpressionToken])).toBe("?");
    expect(format([undefined as unknown as ExpressionToken, n(2)])).toBe("? 2");
    expect(format([n(1), modulo, n(2)])).toBe("1 ? 2");
    expect(format([n(1), noOperator, n(2)])).toBe("1 ? 2");
    expect(format([stringValue])).toBe("?");
  });

  it("ignores typed text that is not a string, even when it equals the value", () => {
    const sameValue = { kind: "number", value: 5, text: 5 } as unknown as ExpressionToken;

    expect(format([numericText])).toBe("1");
    expect(format([sameValue])).toBe("5");
  });

  it("does not throw on any mix of valid and invalid tokens", () => {
    const random = seeded(99);
    const pool = [bogus, modulo, noOperator, stringValue, numericText, n(NaN), n(Infinity), n(1), n(-2, "-2.0"), ADD, SUB, MUL, DIV, OPEN, CLOSE, SQUARE, ROOT];

    for (let sequence = 0; sequence < 20000; sequence++) {
      const input = Array.from({ length: Math.floor(random() * 12) }, () => pool[Math.floor(random() * pool.length)]!);
      // Asserted only on a violation: the passing path stays cheap over 20,000 sequences.
      let output: unknown;
      try {
        output = format(input);
      } catch {
        expect(() => format(input)).not.toThrow();
      }
      if (typeof output !== "string") expect(typeof output).toBe("string");
    }
  });
});

// ---------------------------------------------------------------- properties

describe("nothing is lost: formatted text reads back to the very same tokens", () => {
  it("holds for 30000 random token sequences, valid or not", () => {
    const random = seeded(20261022);
    const pool: ExpressionToken[] = [n(0), n(1), n(2), n(3), n(9), n(0.5), n(12.25), ADD, SUB, MUL, DIV, OPEN, CLOSE, SQUARE, ROOT];
    let longest = 0;

    for (let sequence = 0; sequence < 30000; sequence++) {
      const input = Array.from({ length: Math.floor(random() * 16) }, () => pool[Math.floor(random() * pool.length)]!);
      const text = format(input);

      // Each property is asserted only when violated, so 30,000 passing sequences stay cheap.
      if (!sameTokens(reparse(text), input)) expect(reparse(text), text).toEqual(input);
      if (text !== text.trim()) expect(text).toBe(text.trim());
      if (text.includes("  ")) expect(text).not.toContain("  ");
      if (!/^[\d.()²√+−×÷ ]*$/.test(text)) expect(text).toMatch(/^[\d.()²√+−×÷ ]*$/);
      longest = Math.max(longest, text.length);
    }
    expect(longest).toBeGreaterThan(20);
  });
});

describe("the meaning is preserved: the text evaluates to what the tokens evaluate to", () => {
  const NUMBERS = [0, 1, 2, 3, 4, 5, 9, 16, 0.5, 2.25, -1, -3, -4, -0.5];
  const OPERATORS = [ADD, SUB, MUL, DIV];

  function expression(random: () => number, depth: number): ExpressionToken[] {
    const out = term(random, depth);
    while (random() < 0.5) out.push(OPERATORS[Math.floor(random() * OPERATORS.length)]!, ...term(random, depth));
    return out;
  }

  function term(random: () => number, depth: number): ExpressionToken[] {
    const out: ExpressionToken[] = [];
    while (random() < 0.15) out.push(SUB);
    out.push(...primary(random, depth));
    while (random() < 0.25) out.push(SQUARE);
    return out;
  }

  function primary(random: () => number, depth: number): ExpressionToken[] {
    const roll = random();
    if (depth > 0 && roll < 0.25) return [OPEN, ...expression(random, depth - 1), CLOSE];
    if (depth > 0 && roll < 0.4) return [ROOT, ...primary(random, depth - 1)];
    return [n(NUMBERS[Math.floor(random() * NUMBERS.length)]!)];
  }

  it("holds for 8000 random well-formed expressions, including negative numbers around ² and √", () => {
    const random = seeded(7);
    const seen = { ok: 0, math: 0, negativeBeforeSquare: 0, negativeAfterRoot: 0 };

    for (let index = 0; index < 8000; index++) {
      const input = expression(random, 3);
      const text = format(input);
      const original = evaluator.evaluate(input);
      const fromText = evaluator.evaluate(reparse(text));

      expect(fromText, `${text}  (expression #${index})`).toEqual(original);

      if (original.ok) seen.ok++;
      else if (original.failure === "math") seen.math++;
      input.forEach((token, position) => {
        if (token.kind !== "number" || token.value >= 0) return;
        if (input[position + 1]?.kind === "square") seen.negativeBeforeSquare++;
        if (position > 0 && input[position - 1]?.kind === "squareRoot") seen.negativeAfterRoot++;
      });
    }
    // the interesting cases were really generated
    expect(seen.ok).toBeGreaterThan(1500);
    expect(seen.math).toBeGreaterThan(100);
    expect(seen.negativeBeforeSquare).toBeGreaterThan(50);
    expect(seen.negativeAfterRoot).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------- independence

describe("independence", () => {
  const code = formatterSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("has no eval, Function constructor or DOM access", () => {
    expect(code).not.toMatch(/\beval\s*\(/);
    expect(code).not.toMatch(/\bnew\s+Function\b/);
    for (const global of ["document", "window", "navigator", "localStorage", "HTMLElement"]) {
      expect(code, global).not.toMatch(new RegExp(`\\b${global}\\b`));
    }
  });

  it("imports only shared leaf modules and the token model", () => {
    const imported = [...formatterSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!).sort();
    expect(imported).toEqual(["../NumberFormatter", "../Operator", "./ExpressionToken"]);
  });

  it("does not depend on the NORMAL engine, the evaluator or the UI", () => {
    expect(formatterSource).not.toMatch(/CalculatorEngine|CalculatorState|ExpressionEvaluator|InputHandler|CalculatorUI|ThemeManager/);
  });
});
