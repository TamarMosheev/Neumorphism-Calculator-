import { describe, expect, it } from "vitest";
import type { Operator } from "../Operator";
import { ExpressionEvaluator, MAX_NESTING_DEPTH } from "./ExpressionEvaluator";
import { ExpressionFormatter } from "./ExpressionFormatter";
import { ProCalculator } from "./ProCalculator";
import { numberToken, operatorToken, OPEN_PARENTHESIS, SQUARE, SQUARE_ROOT, isSignMinus, type ExpressionToken } from "./ExpressionToken";
import evaluatorSource from "./ExpressionEvaluator.ts?raw";
import calculatorSource from "./ProCalculator.ts?raw";

const OPERATORS: Record<string, Operator> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };

/** Presses keys, one character each: digits . + - * / ( ) ² √  S (+/-)  % = C. */
function run(keys: string): ProCalculator {
  const calculator = new ProCalculator();

  for (const key of keys.replace(/\s+/g, "")) {
    if (/\d/.test(key)) calculator.inputDigit(key);
    else if (key === ".") calculator.inputDecimal();
    else if (key in OPERATORS) calculator.setOperator(OPERATORS[key]!);
    else if (key === "(") calculator.openParenthesis();
    else if (key === ")") calculator.closeParenthesis();
    else if (key === "²") calculator.square();
    else if (key === "√") calculator.squareRoot();
    else if (key === "S") calculator.toggleSign();
    else if (key === "%") calculator.percent();
    else if (key === "=") calculator.equals();
    else if (key === "C") calculator.clear();
    else throw new Error(`unknown key "${key}"`);
  }
  return calculator;
}

describe("unary minus before parentheses: the required examples", () => {
  it.each([
    ["−(5 + 3) = −8", "-(5+3)=", "-8", "−(5 + 3) ="],
    ["−(2 + 3) × 4 = −20", "-(2+3)*4=", "-20", "−(2 + 3) × 4 ="],
    ["5 × −(2 + 3) = −25", "5*-(2+3)=", "-25", "5 × −(2 + 3) ="],
    ["−(−3 + 1) = 2", "-(-3+1)=", "2", "−(−3 + 1) ="],
    ["(−3)² = 9", "(-3)²=", "9", "(−3)² ="],
    ["−(3²) = −9", "-(3²)=", "-9", "−(3²) ="],
    ["10 − (2 + 3) = 5", "10-(2+3)=", "5", "10 − (2 + 3) ="],
    ["2 × (3 + 4) = 14", "2*(3+4)=", "14", "2 × (3 + 4) ="],
  ])("%s", (_name, keys, value, expression) => {
    const calculator = run(keys);

    expect(calculator.displayValue).toBe(value);
    expect(calculator.expressionText).toBe(expression);
    expect(calculator.phase).toBe("result");
  });
});

describe("the − key makes a sign where an operand is expected", () => {
  it("at the start of an expression, with no 0 − inserted", () => {
    expect(run("-").expressionText).toBe("−");
    expect(run("-5=").expressionText).toBe("−5 =");
    expect(run("-5=").displayValue).toBe("-5");
  });

  it("after any operator", () => {
    expect(run("5*-").expressionText).toBe("5 × −");
    expect(run("5+-3=").expressionText).toBe("5 + −3 =");
    expect(run("5+-3=").displayValue).toBe("2");
    expect(run("5/-2=").displayValue).toBe("-2.5");
  });

  it("after an opening parenthesis", () => {
    expect(run("(-").expressionText).toBe("(−");
    expect(run("(-3+1)=").expressionText).toBe("(−3 + 1) =");
    expect(run("(-3+1)=").displayValue).toBe("-2");
  });

  it("before ( the expression shows −( with no multiplication inserted", () => {
    expect(run("-(").expressionText).toBe("−(");
    expect(run("5*-(").expressionText).toBe("5 × −(");
    expect(run("-(").expressionText).not.toContain("×");
  });

  it("before √: −√9 is −3", () => {
    expect(run("-√9=").expressionText).toBe("−√9 =");
    expect(run("-√9=").displayValue).toBe("-3");
    expect(run("5*-√16=").displayValue).toBe("-20");
    expect(run("-√(9+16)=").displayValue).toBe("-5");
    expect(run("-√(9+16)=").expressionText).toBe("−√(9 + 16) =");
  });

  it("a second − after a sign does nothing (signs do not stack)", () => {
    expect(run("--").expressionText).toBe("−");
    expect(run("5*--3=").expressionText).toBe("5 × −3 =");
    expect(run("5---3=").expressionText).toBe("5 − −3 =");
    expect(run("5---3=").displayValue).toBe("8");
  });

  it("the typed number after a sign is an ordinary number", () => {
    expect(run("-12.5").expressionText).toBe("−12.5");
    expect(run("-12.5").displayValue).toBe("12.5");
  });

  it("shows the running value of a finished group on the main line", () => {
    expect(run("-(5+3)").displayValue).toBe("-8");
    expect(run("-(5+3").displayValue).toBe("3");
  });
});

describe("ordinary subtraction is untouched", () => {
  it.each([
    ["5-3=", "2", "5 − 3 ="],
    ["5-3-1=", "1", "5 − 3 − 1 ="],
    ["(5)-3=", "2", "(5) − 3 ="],
    ["(2+3)-1=", "4", "(2 + 3) − 1 ="],
    ["3²-1=", "8", "3² − 1 ="],
    ["√9-1=", "2", "√9 − 1 ="],
    ["5-(-3)=", "8", "5 − (−3) ="],
    ["5--3=", "8", "5 − −3 ="],
    ["2*3-4=", "2", "2 × 3 − 4 ="],
  ])("%s", (keys, value, expression) => {
    expect(run(keys).displayValue).toBe(value);
    expect(run(keys).expressionText).toBe(expression);
  });

  it("after = the result carries on with a subtraction, not a sign", () => {
    expect(run("5+3=-2=").expressionText).toBe("8 − 2 =");
    expect(run("5+3=-2=").displayValue).toBe("6");
  });
});

describe("precedence of negation, parentheses, multiplication, squaring and roots", () => {
  it.each([
    ["−3² is −(3²) = −9", "-3²=", "-9", "−3² ="],
    ["−(2)² is −(2²) = −4", "-(2)²=", "-4", "−(2)² ="],
    ["(−3)² is 9", "(-3)²=", "9", "(−3)² ="],
    ["a typed negative literal is atomic: 3 +/− x² is 9", "3S²=", "9", "(−3)² ="],
    ["−2 × 3 = −6", "-2*3=", "-6", "−2 × 3 ="],
    ["−2 + 5 = 3", "-2+5=", "3", "−2 + 5 ="],
    ["2 × −3 + 4 = −2", "2*-3+4=", "-2", "2 × −3 + 4 ="],
    ["−(2 + 3) × 4 negates only the group: −5 × 4", "-(2+3)*4=", "-20", "−(2 + 3) × 4 ="],
    ["2 + 3 × 4 is still 14", "2+3*4=", "14", "2 + 3 × 4 ="],
    ["−√9² is −((√9)²) = −9", "-√9²=", "-9", "−√9² ="],
    ["√(−4) has no real root: error (the expression is kept, without =)", "√(-4)=", "Error", "√(−4)"],
    ["√(−(−4)) is 2", "√(-(-4))=", "2", "√(−(−4)) ="],
  ])("%s", (_name, keys, value, expression) => {
    expect(run(keys).displayValue).toBe(value);
    expect(run(keys).expressionText).toBe(expression);
  });
});

describe("nested parentheses with unary minus", () => {
  it.each([
    ["−(1 + (2 + 3)) = −6", "-(1+(2+3))=", "-6", "−(1 + (2 + 3)) ="],
    ["−(−(2 + 3)) = 5", "-(-(2+3))=", "5", "−(−(2 + 3)) ="],
    ["2 × −(−(1 + 1)) = 4", "2*-(-(1+1))=", "4", "2 × −(−(1 + 1)) ="],
    ["−(1 + −(2 + 3)) = 4", "-(1+-(2+3))=", "4", "−(1 + −(2 + 3)) ="],
    ["(−(1 + 2)) × (−(3)) = 9", "(-(1+2))*(-(3))=", "9", "(−(1 + 2)) × (−(3)) ="],
  ])("%s", (_name, keys, value, expression) => {
    expect(run(keys).displayValue).toBe(value);
    expect(run(keys).expressionText).toBe(expression);
  });

  it("an operand right after a finished group still gets the implied ×, but a sign never does", () => {
    expect(run("(2)(3)=").expressionText).toBe("(2) × (3) =");
    expect(run("2-(3)=").expressionText).toBe("2 − (3) =");
    expect(run("2*-(3)=").expressionText).toBe("2 × −(3) =");
  });

  it("stays safe at the nesting limit: extra −( keys are ignored, and the expression still evaluates", () => {
    const calculator = run("-(".repeat(MAX_NESTING_DEPTH) + "1" + ")".repeat(MAX_NESTING_DEPTH) + "=");

    expect(calculator.phase).toBe("result");
    expect(calculator.displayValue).toBe("1");
  });
});

describe("the other operators around a sign", () => {
  it("another operator replaces the operator the sign followed: 5 × − then + is 5 +", () => {
    expect(run("5*-+3=").expressionText).toBe("5 + 3 =");
    expect(run("5*-+3=").displayValue).toBe("8");
    expect(run("5+-*3=").expressionText).toBe("5 × 3 =");
  });

  it("a sign at the start of an expression or group has no operator to replace, so other operators are ignored", () => {
    expect(run("-+").expressionText).toBe("−");
    expect(run("-*5=").expressionText).toBe("−5 =");
    expect(run("(-/").expressionText).toBe("(−");
  });

  it("a ) right after a sign is ignored, so ( − ) cannot be built", () => {
    expect(run("(-)").expressionText).toBe("(−");
  });

  it("a − right after √ is ignored: √− would be malformed", () => {
    expect(run("√-").expressionText).toBe("√");
    expect(run("√-4=").expressionText).toBe("√4 =");
    expect(run("√-4=").displayValue).toBe("2");
  });
});

describe("+/− on a finished parenthesized group", () => {
  it("negates the group, and pressing it again restores the group", () => {
    expect(run("(5+3)S").expressionText).toBe("−(5 + 3)");
    expect(run("(5+3)S").displayValue).toBe("-8");
    expect(run("(5+3)SS").expressionText).toBe("(5 + 3)");
    expect(run("(5+3)SS").displayValue).toBe("8");
  });

  it("only negates the last group, wherever it sits", () => {
    expect(run("2*(3+4)S").expressionText).toBe("2 × −(3 + 4)");
    expect(run("(1+2)*(3+4)S=").expressionText).toBe("(1 + 2) × −(3 + 4) =");
    expect(run("(1+2)*(3+4)S=").displayValue).toBe("-21");
  });

  it("negates the outer group of nested ones", () => {
    expect(run("((1+2))S").expressionText).toBe("−((1 + 2))");
    expect(run("(1+(2+3))S").expressionText).toBe("−(1 + (2 + 3))");
  });

  it("works with the − key in either order: −( and then ), or ( ) and then +/−", () => {
    expect(run("(5+3)S=").displayValue).toBe(run("-(5+3)=").displayValue);
  });

  it("does nothing where there is no group to negate (as before)", () => {
    expect(run("S").expressionText).toBe("");
    expect(run("5+S").expressionText).toBe("5 +");
    expect(run("(S").expressionText).toBe("(");
    expect(run("3²S").expressionText).toBe("3²");
    expect(run("√S").expressionText).toBe("√");
  });

  it("leaves a group right after √ alone, since √(…) takes its group directly", () => {
    expect(run("√(4)S").expressionText).toBe("√(4)");
  });

  it("still negates a number being typed, as a negative literal (unchanged)", () => {
    expect(run("5+3S").expressionText).toBe("5 + −3");
    expect(run("(3S").expressionText).toBe("(−3");
  });

  it("still negates a result (unchanged)", () => {
    expect(run("(5+3)=S").displayValue).toBe("-8");
  });
});

describe("incomplete and malformed expressions are reported, never repaired", () => {
  it.each([
    ["a lone sign: −", "-=", "−"],
    ["a sign before an open group: −(", "-(=", "−("],
    ["an unclosed group: −(5 + 3", "-(5+3=", "−(5 + 3"],
    ["a trailing operator: 5 × −", "5*-=", "5 × −"],
    ["an empty root: −√", "-√=", "−√"],
    ["an unclosed group after an operator: 2 × −(3", "2*-(3=", "2 × −(3"],
  ])("%s", (_name, keys, expression) => {
    const calculator = run(keys);

    expect(calculator.phase).toBe("error");
    expect(calculator.displayValue).toBe("Error");
    expect(calculator.expressionText).toBe(expression);
  });

  it("AC clears the error, and a new expression with a sign works", () => {
    const calculator = run("-(5+3=C-(2+3)*4=");

    expect(calculator.expressionText).toBe("−(2 + 3) × 4 =");
    expect(calculator.displayValue).toBe("-20");
  });

  it("a math failure under a sign (division by zero) is an error with the expression kept", () => {
    const calculator = run("-(5/0)=");

    expect(calculator.displayValue).toBe("Error");
    expect(calculator.expressionText).toBe("−(5 ÷ 0)");
  });
});

describe("the sign token is the existing subtract token: no new parser, formatter or token kind", () => {
  const formatter = new ExpressionFormatter();
  const evaluator = new ExpressionEvaluator();
  const MINUS = operatorToken("subtract");
  const PLUS = operatorToken("add");

  it("isSignMinus: a minus at the start, or after an operator, ( or √, is a sign; after an operand it is a subtraction", () => {
    const n = (value: number): ExpressionToken => numberToken(value);

    expect(isSignMinus([MINUS, n(5)], 0)).toBe(true);
    expect(isSignMinus([n(2), PLUS, MINUS, n(5)], 2)).toBe(true);
    expect(isSignMinus([OPEN_PARENTHESIS, MINUS, n(5)], 1)).toBe(true);
    expect(isSignMinus([SQUARE_ROOT, MINUS, n(5)], 1)).toBe(true);
    expect(isSignMinus([n(5), MINUS, n(2)], 1)).toBe(false);
    expect(isSignMinus([n(5), SQUARE, MINUS, n(2)], 2)).toBe(false);
    expect(isSignMinus([n(5), PLUS, n(2)], 1)).toBe(false);
    expect(isSignMinus([MINUS], -1)).toBe(false);
    expect(isSignMinus([MINUS], 5)).toBe(false);
  });

  it("the formatter and evaluator agree on what the calculator builds", () => {
    const tokens: ExpressionToken[] = [MINUS, OPEN_PARENTHESIS, numberToken(5), PLUS, numberToken(3), { kind: "close" }];

    expect(formatter.format(tokens)).toBe("−(5 + 3)");
    expect(evaluator.evaluate(tokens)).toEqual({ ok: true, value: -8 });
  });

  it("the evaluator was not changed for this feature: it already had the unary rule, and still has no eval", () => {
    expect(evaluatorSource).toContain('unary      := "-" unary | postfix');
    expect(evaluatorSource).not.toMatch(/\beval\s*\(|\bnew\s+Function\b/);
  });

  it("ProCalculator stays free of eval, Function and the DOM", () => {
    const code = calculatorSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/\beval\s*\(|\bnew\s+Function\b/);
    for (const global of ["document", "window", "HTMLElement"]) expect(code, global).not.toMatch(new RegExp(`\\b${global}\\b`));
  });
});
