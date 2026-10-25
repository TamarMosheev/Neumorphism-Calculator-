import { describe, expect, it } from "vitest";
import { CalculatorEngine } from "../CalculatorEngine";
import type { Operator } from "../Operator";
import { ExpressionEvaluator, MAX_NESTING_DEPTH, type EvaluationResult } from "./ExpressionEvaluator";
import { ExpressionFormatter } from "./ExpressionFormatter";
import { ProCalculator } from "./ProCalculator";
import proSource from "./ProCalculator.ts?raw";
import {
  CLOSE_PARENTHESIS,
  OPEN_PARENTHESIS,
  SQUARE,
  SQUARE_ROOT,
  numberToken,
  operatorToken,
  type ExpressionToken,
} from "./ExpressionToken";

// ---------------------------------------------------------------- helpers (test-only)

const OPERATORS: Record<string, Operator> = { "+": "add", "-": "subtract", "*": "multiply", "×": "multiply", "/": "divide", "÷": "divide" };

/**
 * Presses keys, one character each (spaces ignored):
 *   0-9 . digits   + - * /  operators   ( )  parentheses   ²  square   √  root
 *   S  the +/- key   %  percent   =  equals   C  AC
 */
function press(calculator: ProCalculator, keys: string): ProCalculator {
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

const run = (keys: string): ProCalculator => press(new ProCalculator(), keys);
const resultOf = (keys: string): string => run(keys).displayValue;

/** The NORMAL calculator driven by the same keys (used to prove PRO agrees with it where they should). */
function normalResultOf(keys: string): string {
  const engine = new CalculatorEngine();
  for (const key of keys.replace(/\s+/g, "")) {
    if (/\d/.test(key)) engine.inputDigit(key);
    else if (key === ".") engine.inputDecimal();
    else if (key in OPERATORS) engine.setOperator(OPERATORS[key]!);
    else if (key === "S") engine.toggleSign();
    else if (key === "%") engine.percent();
    else if (key === "=") engine.equals();
    else if (key === "C") engine.clear();
  }
  return engine.displayValue;
}

/** Reads formatted expression text back into tokens (every "−" is the operator token). */
function reparse(text: string): ExpressionToken[] {
  return [...text.matchAll(/\d+(?:\.\d*)?(?:e[+-]?\d+)?|[()²√+−×÷]/g)].map(([piece]): ExpressionToken => {
    if (/^\d/.test(piece)) return numberToken(Number(piece));
    if (piece === "(") return OPEN_PARENTHESIS;
    if (piece === ")") return CLOSE_PARENTHESIS;
    if (piece === "²") return SQUARE;
    if (piece === "√") return SQUARE_ROOT;
    return operatorToken(OPERATORS[piece === "−" ? "-" : piece]!);
  });
}

const evaluator = new ExpressionEvaluator();

/** Appends what an unfinished expression still needs: an operand after a trailing operator/(/√, and the ")"s. */
function completed(tokens: ExpressionToken[]): ExpressionToken[] {
  const out = [...tokens];
  const last = out.at(-1)?.kind;
  if (last === "operator" || last === "open" || last === "squareRoot") out.push(numberToken(1));

  let open = 0;
  for (const token of out) open += token.kind === "open" ? 1 : token.kind === "close" ? -1 : 0;
  for (; open > 0; open--) out.push(CLOSE_PARENTHESIS);
  return out;
}

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

// ---------------------------------------------------------------- initial state

describe("initial state", () => {
  it("shows 0 with no expression", () => {
    const calculator = new ProCalculator();
    expect(calculator.displayValue).toBe("0");
    expect(calculator.expressionText).toBe("");
    expect(calculator.phase).toBe("building");
  });
});

// ---------------------------------------------------------------- arithmetic

describe("arithmetic and operator precedence", () => {
  it.each([
    ["2+3=", "5"],
    ["9-12=", "-3"],
    ["6*7=", "42"],
    ["8/4=", "2"],
    ["1/4=", "0.25"],
    ["0.5-2=", "-1.5"],
    [".5+.5=", "1"],
    ["2.5*2=", "5"],
  ])("%s -> %s", (keys, expected) => {
    expect(resultOf(keys)).toBe(expected);
  });

  describe("standard precedence (unlike NORMAL, which is left to right)", () => {
    it.each([
      ["2+3*4=", "14"],
      ["2*3+4=", "10"],
      ["2+6/3=", "4"],
      ["2-3*4+5=", "-5"],
      ["2*3+4*5=", "26"],
      ["10-4-3=", "3"],
      ["100/10/2=", "5"],
      ["8/2*4=", "16"],
      ["1+2+3=", "6"],
    ])("%s -> %s", (keys, expected) => {
      expect(resultOf(keys)).toBe(expected);
    });

    it("differs from NORMAL on 2 + 3 × 4", () => {
      expect(resultOf("2+3*4=")).toBe("14");
      expect(normalResultOf("2+3*4=")).toBe("20");
    });
  });

  describe("precision is handled like NORMAL", () => {
    it.each([
      ["0.1+0.2=", "0.3"],
      ["0.1+0.2-0.3=", "0"],
      ["1/3*3=", "1"],
      ["123456789012345+1=", "123456789012346"],
      ["999999999999999*999999999999999=", "9.99999999999998e+29"],
    ])("%s -> %s", (keys, expected) => {
      expect(resultOf(keys)).toBe(expected);
    });
  });

  it("reports division by zero as Error", () => {
    expect(resultOf("1/0=")).toBe("Error");
    expect(resultOf("0/0=")).toBe("Error");
    expect(resultOf("1/(2-2)=")).toBe("Error");
    expect(resultOf("0*(1/0)=")).toBe("Error");
  });

  describe("what the screen shows while the expression is built", () => {
    it.each([
      ["2", "2", "2"],
      ["2+", "2", "2 +"],
      ["2+3", "5", "2 + 3"],
      ["2+3*", "5", "2 + 3 ×"],
      ["2+3*4", "14", "2 + 3 × 4"],
      ["(2+3)", "5", "(2 + 3)"],
      ["(2+3", "5", "(2 + 3"],
      ["3²", "9", "3²"],
      ["2+3²", "11", "2 + 3²"],
    ])("%s", (keys, display, expression) => {
      const calculator = run(keys);
      expect(calculator.displayValue).toBe(display);
      expect(calculator.expressionText).toBe(expression);
    });
  });
});

// ---------------------------------------------------------------- parentheses and implicit multiplication

describe("parentheses", () => {
  it.each([
    ["(2+3)*4=", "20", "(2 + 3) × 4 ="],
    ["((1+2)*(3+4))=", "21", "((1 + 2) × (3 + 4)) ="],
    ["2*(3+(4*5))=", "46", "2 × (3 + (4 × 5)) ="],
    ["10-(2-3)=", "11", "10 − (2 − 3) ="],
    ["(8/2)/2=", "2", "(8 ÷ 2) ÷ 2 ="],
    ["(((5)))=", "5", "(((5))) ="],
  ])("%s -> %s", (keys, value, expression) => {
    const calculator = run(keys);
    expect(calculator.displayValue).toBe(value);
    expect(calculator.expressionText).toBe(expression);
  });

  describe("keys that would break the grammar are ignored", () => {
    it.each([
      [")", ""],
      ["(", "("],
      ["()", "("],
      ["2+)", "2 +"],
      ["(2+3))", "(2 + 3)"],
      ["(+", "("],
      ["(*", "("],
      ["(/", "("],
    ])("%s -> expression %j", (keys, expression) => {
      expect(run(keys).expressionText).toBe(expression);
    });

    it("so a stray ) does not stop the expression from working", () => {
      expect(resultOf("2+)3=")).toBe("5");
      expect(resultOf("(2+3))*2=")).toBe("10");
    });
  });
});

describe("implicit multiplication", () => {
  it.each([
    ["2(3+4)=", "14", "2 × (3 + 4) ="],
    ["(2+3)4=", "20", "(2 + 3) × 4 ="],
    ["(2+3)(4+5)=", "45", "(2 + 3) × (4 + 5) ="],
    ["2(3)(4)=", "24", "2 × (3) × (4) ="],
    ["3²4=", "36", "3² × 4 ="],
    ["3²(2)=", "18", "3² × (2) ="],
    ["9√4=", "12", "√9 × 4 ="],
    ["(9+16)√4=", "50", "(9 + 16) × √4 ="],
    ["(1)2=", "2", "(1) × 2 ="],
    ["(1).5=", "0.5", "(1) × 0.5 ="],
  ])("%s -> %s with the × shown", (keys, value, expression) => {
    const calculator = run(keys);
    expect(calculator.displayValue).toBe(value);
    expect(calculator.expressionText).toBe(expression);
  });

  it("puts an explicit × in the expression as soon as the next operand starts", () => {
    expect(run("(1)").expressionText).toBe("(1)");
    expect(run("(1)2").expressionText).toBe("(1) × 2");
    expect(run("(1)(").expressionText).toBe("(1) × (");
    expect(run("(1)√").expressionText).toBe("(1) × √");
    expect(run("3²2").expressionText).toBe("3² × 2");
  });

  it("does not add a × where an operator already stands", () => {
    expect(run("2+(").expressionText).toBe("2 + (");
    expect(run("2*3").expressionText).toBe("2 × 3");
    expect(run("(2").expressionText).toBe("(2");
  });
});

// ---------------------------------------------------------------- squares and roots

describe("squares", () => {
  it.each([
    ["3²=", "9", "3² ="],
    ["(2+3)²=", "25", "(2 + 3)² ="],
    ["2²²=", "16", "2²² ="],
    ["2*3²=", "18", "2 × 3² ="],
    ["3²+4²=", "25", "3² + 4² ="],
    ["0.5²=", "0.25", "0.5² ="],
    ["1.5²=", "2.25", "1.5² ="],
  ])("%s -> %s", (keys, value, expression) => {
    const calculator = run(keys);
    expect(calculator.displayValue).toBe(value);
    expect(calculator.expressionText).toBe(expression);
  });

  it("squares a negative number with its sign kept: 3 +/- then x² is (−3)² = 9", () => {
    const calculator = run("3S²");
    expect(calculator.expressionText).toBe("(−3)²");
    expect(calculator.displayValue).toBe("9");
    expect(resultOf("3S²=")).toBe("9");
  });

  it("squares the finished group, not just its last number", () => {
    expect(resultOf("(2+3)²=")).toBe("25");
    expect(resultOf("2+(3)²=")).toBe("11");
  });

  describe("is ignored where there is nothing to square", () => {
    it.each([
      ["²", ""],
      ["2+²", "2 +"],
      ["(²", "("],
      ["√²", "√"],
    ])("%s -> expression %j", (keys, expression) => {
      expect(run(keys).expressionText).toBe(expression);
    });
  });

  it("overflowing to infinity is an error", () => {
    expect(resultOf("10²²²²²²²²=")).toBe("1e+256");
    expect(resultOf("10²²²²²²²²²=")).toBe("Error");
  });
});

describe("square roots", () => {
  it.each([
    ["√81=", "9", "√81 ="],
    ["√(9+16)=", "5", "√(9 + 16) ="],
    ["√√16=", "2", "√√16 ="],
    ["16√²=", "16", "√16² ="],
    ["√9²=", "9", "√9² ="],
    ["2*√9=", "6", "2 × √9 ="],
    ["9√*2=", "6", "√9 × 2 ="],
    ["√16+√9=", "7", "√16 + √9 ="],
    ["√(3²+4²)=", "5", "√(3² + 4²) ="],
    ["√0.25=", "0.5", "√0.25 ="],
  ])("%s -> %s", (keys, value, expression) => {
    const calculator = run(keys);
    expect(calculator.displayValue).toBe(value);
    expect(calculator.expressionText).toBe(expression);
  });

  describe("when a number is already being entered, √ is taken of that number", () => {
    it("81 then √ is √81", () => {
      const calculator = run("81√");
      expect(calculator.expressionText).toBe("√81");
      expect(calculator.displayValue).toBe("9");
      expect(calculator.phase).toBe("building");
    });

    it("keeps a typed decimal's spelling", () => {
      expect(run("2.50√").expressionText).toBe("√2.50");
      expect(run("5.√").expressionText).toBe("√5.");
    });

    it("applies to a number that follows an operator", () => {
      expect(run("2+16√").expressionText).toBe("2 + √16");
      expect(resultOf("2+16√=")).toBe("6");
    });

    it("applies to a percentage that was just worked out", () => {
      const calculator = run("50%√");
      expect(calculator.expressionText).toBe("√0.5");
      expect(calculator.displayValue).toBe("0.707106781186548");
    });

    it("applies to a negative number: the root of a negative is an error, not a malformed expression", () => {
      const calculator = run("4S√");
      expect(calculator.expressionText).toBe("√(−4)");
      expect(resultOf("4S√=")).toBe("Error");
    });

    it("applies to the result on screen after =", () => {
      const calculator = run("9=√");
      expect(calculator.expressionText).toBe("√9");
      expect(calculator.displayValue).toBe("3");
      expect(resultOf("9=√=")).toBe("3");
    });

    it("then the next number is multiplied: √81 × 2", () => {
      expect(run("81√2").expressionText).toBe("√81 × 2");
      expect(resultOf("81√2=")).toBe("18");
    });

    it("so 2 then √ then 9 is √2 × 9, while 2 × √ 9 is 2 × √9", () => {
      expect(run("2√9").expressionText).toBe("√2 × 9");
      expect(run("2*√9").expressionText).toBe("2 × √9");
    });
  });

  describe("when no number is being entered, √ starts a radicand that the next digits fill", () => {
    it("at the start: √ then 81 is √81", () => {
      const start = run("√");
      expect(start.expressionText).toBe("√");
      expect(start.displayValue).toBe("0");

      const filled = run("√81");
      expect(filled.expressionText).toBe("√81");
      expect(filled.displayValue).toBe("9");
      expect(resultOf("√81=")).toBe("9");
    });

    it("after an operator", () => {
      expect(run("2*√").expressionText).toBe("2 × √");
      expect(run("2*√").displayValue).toBe("2");
    });

    it("after (", () => {
      expect(run("(√").expressionText).toBe("(√");
      expect(resultOf("(√16)=")).toBe("4");
    });

    it("after another √", () => {
      expect(run("√√").expressionText).toBe("√√");
      expect(resultOf("√√81=")).toBe("3");
    });

    it("whose digits can be a group: √ then ( ... )", () => {
      expect(resultOf("√(9+16)=")).toBe("5");
    });
  });

  describe("after a finished operand, √ multiplies", () => {
    it("after a group", () => {
      const calculator = run("(9+16)√");
      expect(calculator.expressionText).toBe("(9 + 16) × √");
      expect(calculator.displayValue).toBe("25");
    });

    it("after a square", () => {
      expect(run("3²√").expressionText).toBe("3² × √");
    });

    it("after another wrapped root", () => {
      expect(run("9√√").expressionText).toBe("√9 × √");
    });
  });

  describe("an unfinished root is never silently completed", () => {
    it.each([
      ["√+", "√"],
      ["√)", "√"],
      ["√²", "√"],
      ["√%", "√"],
      ["√S", "√"],
    ])("%s leaves the radicand open: %j", (keys, expression) => {
      const calculator = run(keys);
      expect(calculator.expressionText).toBe(expression);
      expect(calculator.phase).toBe("building");
    });

    it("= on a root with no number is an error", () => {
      const calculator = run("√=");
      expect(calculator.phase).toBe("error");
      expect(calculator.expressionText).toBe("√");
    });
  });

  it("is an error for a negative radicand", () => {
    expect(resultOf("√(0-1)=")).toBe("Error");
    expect(resultOf("√(2-3)=")).toBe("Error");
  });
});

// ---------------------------------------------------------------- percentages

describe("percentages", () => {
  describe("the required examples", () => {
    it("50 % = 0.5", () => {
      const calculator = run("50%");
      expect(calculator.displayValue).toBe("0.5");
      expect(calculator.expressionText).toBe("0.5");
      expect(resultOf("50%=")).toBe("0.5");
    });

    it.each([
      ["200+10%=", "220", "200 + 20 ="],
      ["200-10%=", "180", "200 − 20 ="],
      ["200*10%=", "20", "200 × 0.1 ="],
      ["200/10%=", "2000", "200 ÷ 0.1 ="],
    ])("%s -> %s", (keys, value, expression) => {
      const calculator = run(keys);
      expect(calculator.displayValue).toBe(value);
      expect(calculator.expressionText).toBe(expression);
    });

    it("shows the worked-out number as soon as % is pressed, like NORMAL", () => {
      const calculator = run("200+10%");
      expect(calculator.displayValue).toBe("220");
      expect(calculator.expressionText).toBe("200 + 20");
      expect(calculator.phase).toBe("building");
    });
  });

  describe("after + or − the percentage is of everything to the left, with precedence", () => {
    it.each([
      ["2+3*4+10%=", "15.4", "2 + 3 × 4 + 1.4 ="],
      ["(100+10%)*2=", "220", "(100 + 10) × 2 ="],
      ["5*(200+10%)=", "1100", "5 × (200 + 20) ="],
      ["100+(50+10%)=", "155", "100 + (50 + 5) ="],
      ["100-10%-10%=", "81", "100 − 10 − 9 ="],
      ["200+2.5%=", "205", "200 + 5 ="],
    ])("%s -> %s", (keys, value, expression) => {
      const calculator = run(keys);
      expect(calculator.displayValue).toBe(value);
      expect(calculator.expressionText).toBe(expression);
    });
  });

  describe("after × or ÷, or with nothing before it, it is a plain fraction", () => {
    it.each([
      ["200+5*10%=", "200.5", "200 + 5 × 0.1 ="],
      ["2*50%=", "1", "2 × 0.5 ="],
      ["50%+1=", "1.5", "0.5 + 1 ="],
      ["(50%)=", "0.5", "(0.5) ="],
    ])("%s -> %s", (keys, value, expression) => {
      const calculator = run(keys);
      expect(calculator.displayValue).toBe(value);
      expect(calculator.expressionText).toBe(expression);
    });
  });

  describe("signs and repeated use", () => {
    it("works on a negative number: 200 + (−10)% is 180, 200 − (−10)% is 220", () => {
      expect(resultOf("200+10S%=")).toBe("180");
      expect(resultOf("200-10S%=")).toBe("220");
    });

    it("applies again to the worked-out number, as in NORMAL", () => {
      expect(resultOf("200+10%%=")).toBe(normalResultOf("200+10%%="));
      expect(resultOf("200+10%%=")).toBe("240");
    });

    it("typing replaces the worked-out number", () => {
      expect(resultOf("200+10%5=")).toBe("205");
      expect(run("200+10%5").expressionText).toBe("200 + 5");
    });

    it("the sign key negates the worked-out number", () => {
      expect(run("50%S").displayValue).toBe("-0.5");
      expect(resultOf("200+10%S=")).toBe("180");
    });
  });

  describe("on a result", () => {
    it("2 + 3 = then % is 0.05, ready to continue or be replaced", () => {
      const calculator = run("2+3=%");
      expect(calculator.displayValue).toBe("0.05");
      expect(calculator.expressionText).toBe("0.05");
      expect(calculator.phase).toBe("building");
      expect(resultOf("2+3=%*4=")).toBe("0.2");
      expect(run("2+3=%7").displayValue).toBe("7");
    });
  });

  describe("is ignored where there is no number to convert", () => {
    it.each([
      ["%", ""],
      ["200+%", "200 +"],
      ["(2+3)%", "(2 + 3)"],
      ["2²%", "2²"],
      ["(%", "("],
      ["√%", "√"],
    ])("%s -> expression %j", (keys, expression) => {
      expect(run(keys).expressionText).toBe(expression);
    });
  });

  it("skips a finished group nested inside the open one when finding the left side", () => {
    // inside the outer group the left side of + is (1 + 2) = 3, so 10 % is 0.3 and the group is 3.3
    expect(resultOf("5*((1+2)+10%)=")).toBe("16.5");
    expect(run("5*((1+2)+10%").expressionText).toBe("5 × ((1 + 2) + 0.3");
  });

  it("shows the worked-out percentage rounded for display, like every other number", () => {
    // 10 % of 14 is 1.4000000000000001 in binary floating point
    expect(run("2+3*4+10%").displayValue).toBe("15.4");
    expect(run("2+3*4+10%").expressionText).toBe("2 + 3 × 4 + 1.4");
  });

  it("a percentage that overflows to infinity is an error", () => {
    // 10^256 * 1e15 * 1e15 * 1e15 is about 1e301; 10 % style factor 1e13 would exceed the largest double
    const calculator = run("10²²²²²²²²*999999999999999*999999999999999*999999999999999+999999999999999%");
    expect(calculator.phase).toBe("error");
    expect(calculator.displayValue).toBe("Error");
  });

  it("a plain fraction does not need the left side, so a failing one is only reported at =", () => {
    const calculator = run("1/0*10%");
    expect(calculator.phase).toBe("building");
    expect(calculator.expressionText).toBe("1 ÷ 0 × 0.1");

    press(calculator, "=");
    expect(calculator.phase).toBe("error");
  });

  it("a failing left side makes the percentage an error", () => {
    const calculator = run("1/0+10%");
    expect(calculator.phase).toBe("error");
    expect(calculator.displayValue).toBe("Error");
    expect(calculator.expressionText).toBe("1 ÷ 0 + 10");
  });
});

// ---------------------------------------------------------------- signs and decimals

describe("signs", () => {
  it.each([
    ["5S", "-5", "−5"],
    ["5SS", "5", "5"],
    ["0S", "0", "0"],
    ["12S", "-12", "−12"],
    ["5.S", "-5.", "−5."],
    ["2.00S", "-2.00", "−2.00"],
    ["50%S", "-0.5", "−0.5"],
  ])("%s", (keys, display, expression) => {
    const calculator = run(keys);
    expect(calculator.displayValue).toBe(display);
    expect(calculator.expressionText).toBe(expression);
  });

  it("does nothing without a number to negate", () => {
    expect(run("S").expressionText).toBe("");
    expect(run("5+S").expressionText).toBe("5 +");
    expect(run("(S").expressionText).toBe("(");
    expect(run("3²S").expressionText).toBe("3²");
    expect(run("√S").expressionText).toBe("√");
  });

  it("a negative second operand: 5 + 3 +/- = 2", () => {
    expect(resultOf("5+3S=")).toBe("2");
    expect(run("5+3S").expressionText).toBe("5 + −3");
    expect(resultOf("2*3S=")).toBe("-6");
  });

  it("on a result, it negates it and the result can be carried on", () => {
    const calculator = run("2+3=S");
    expect(calculator.displayValue).toBe("-5");
    expect(calculator.expressionText).toBe("−5");
    expect(resultOf("2+3=S+1=")).toBe("-4");
    expect(run("2+3=S4").displayValue).toBe("4");
  });

  it("leaves a zero result alone", () => {
    const calculator = run("1-1=S");
    expect(calculator.displayValue).toBe("0");
    expect(calculator.phase).toBe("result");
  });
});

describe("decimals and entry limits (same rules as NORMAL)", () => {
  it.each([
    [".", "0."],
    ["5.7.3", "5.73"],
    ["2.00", "2.00"],
    ["005", "5"],
    ["00", "0"],
    ["0.5", "0.5"],
  ])("%s -> %s", (keys, display) => {
    expect(run(keys).displayValue).toBe(display);
  });

  it("keeps typed trailing zeros in the expression and the result is exact", () => {
    const calculator = run("1.0+2.50=");
    expect(calculator.expressionText).toBe("1.0 + 2.50 =");
    expect(calculator.displayValue).toBe("3.5");
  });

  it("accepts 15 digits and ignores the rest", () => {
    expect(run("1234567890123456").displayValue).toBe("123456789012345");
  });

  it("counts digits after the decimal point but not the sign or the point", () => {
    expect(run("1.23456789012345678").displayValue).toBe("1.23456789012345");
    expect(run("123456789012345S9").displayValue).toBe("-123456789012345");
    expect(run("123456789012345.").displayValue).toBe("123456789012345.");
  });

  it("gives every operand its own limit", () => {
    expect(run("123456789012345+999999999999999999").expressionText).toBe("123456789012345 + 999999999999999");
  });

  it("starts a decimal operand after an operator, a group or a finished operand", () => {
    expect(run("2+.").expressionText).toBe("2 + 0.");
    expect(run("(.").expressionText).toBe("(0.");
    expect(run("(1).").expressionText).toBe("(1) × 0.");
  });
});

// ---------------------------------------------------------------- equals, AC, result continuation, errors

describe("equals", () => {
  it("shows the result and the expression with =", () => {
    const calculator = run("2+3=");
    expect(calculator.displayValue).toBe("5");
    expect(calculator.expressionText).toBe("2 + 3 =");
    expect(calculator.phase).toBe("result");
  });

  it("does nothing when pressed again, or with nothing entered", () => {
    expect(run("2+3==").expressionText).toBe("2 + 3 =");
    expect(run("2+3===").displayValue).toBe("5");
    const empty = run("=");
    expect(empty.phase).toBe("building");
    expect(empty.displayValue).toBe("0");
  });

  it("evaluates a lone number", () => {
    expect(run("7=").displayValue).toBe("7");
    expect(run("7=").expressionText).toBe("7 =");
  });
});

describe("result continuation", () => {
  it("an operator carries the result on", () => {
    expect(resultOf("2+3=*4=")).toBe("20");
    expect(run("2+3=*4=").expressionText).toBe("5 × 4 =");
    expect(resultOf("2+3=-1=")).toBe("4");
    expect(run("2+3=+").expressionText).toBe("5 +");
  });

  it("a digit or decimal point starts a new expression", () => {
    const fresh = run("2+3=4");
    expect(fresh.displayValue).toBe("4");
    expect(fresh.expressionText).toBe("4");
    expect(resultOf("2+3=4+1=")).toBe("5");
    expect(run("2+3=.").displayValue).toBe("0.");
  });

  it("( starts a new expression", () => {
    expect(run("2+3=(").expressionText).toBe("(");
    expect(resultOf("2+3=(1+1)=")).toBe("2");
  });

  it("² and √ apply to the result", () => {
    const squared = run("3+2=²");
    expect(squared.expressionText).toBe("5²");
    expect(squared.displayValue).toBe("25");
    expect(resultOf("3+2=²=")).toBe("25");
    expect(run("3+2=√").expressionText).toBe("√5");
  });

  it("a ) after a result is ignored", () => {
    const calculator = run("2+3=)");
    expect(calculator.phase).toBe("result");
    expect(calculator.expressionText).toBe("2 + 3 =");
  });
});

describe("AC", () => {
  it.each([
    ["from a half-built expression", "2+3*(4"],
    ["from a result", "2+3="],
    ["from an error", "5/0="],
    ["from a number being typed", "123.45"],
    ["from a worked-out percentage", "200+10%"],
  ])("resets everything %s", (_label, keys) => {
    const calculator = run(`${keys}C`);
    expect(calculator.displayValue).toBe("0");
    expect(calculator.expressionText).toBe("");
    expect(calculator.phase).toBe("building");
  });

  it("forgets the old expression completely", () => {
    expect(resultOf("2+3*(C4=")).toBe("4");
    expect(resultOf("5+C=")).toBe("0");
  });
});

describe("errors", () => {
  it("division by zero shows Error and keeps the expression", () => {
    const calculator = run("5/0=");
    expect(calculator.displayValue).toBe("Error");
    expect(calculator.expressionText).toBe("5 ÷ 0");
    expect(calculator.phase).toBe("error");
  });

  it.each([
    ["+"], ["-"], ["*"], ["/"], [")"], ["²"], ["√"], ["S"], ["%"], ["="],
  ])("ignores %s while in error", (key) => {
    const calculator = run(`5/0=${key}`);
    expect(calculator.phase).toBe("error");
    expect(calculator.displayValue).toBe("Error");
    expect(calculator.expressionText).toBe("5 ÷ 0");
  });

  describe("recovers by a digit, a decimal point, ( or AC", () => {
    it.each([
      ["a digit", "5/0=7", "7", "7"],
      ["a decimal point", "5/0=.", "0.", "0."],
      ["an opening parenthesis", "5/0=(", "0", "("],
      ["AC", "5/0=C", "0", ""],
    ])("%s", (_label, keys, display, expression) => {
      const calculator = run(keys);
      expect(calculator.phase).toBe("building");
      expect(calculator.displayValue).toBe(display);
      expect(calculator.expressionText).toBe(expression);
    });

    it("and the new expression works normally", () => {
      expect(resultOf("5/0=7+1=")).toBe("8");
      expect(resultOf("5/0=C2*3=")).toBe("6");
      expect(resultOf("√(0-1)=4+4=")).toBe("8");
    });

    it("forgetting the failed expression", () => {
      expect(run("5/0=7").expressionText).toBe("7");
    });
  });

  it.each([
    ["√(0-1)="],
    ["1/(2-2)="],
    ["0/0="],
    ["10²²²²²²²²²="],
    ["999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999*999999999999999="],
  ])("any failing evaluation shows Error: %s", (keys) => {
    const calculator = run(keys);
    expect(calculator.displayValue).toBe("Error");
    expect(calculator.phase).toBe("error");
  });
});

// ---------------------------------------------------------------- invalid expressions

describe("invalid expressions are reported, never repaired", () => {
  describe("= on an unfinished expression is an error and the expression stays as entered", () => {
    it.each([
      ["(2+3=", "(2 + 3", "an unclosed parenthesis is not auto-closed"],
      ["2+=", "2 +", "a trailing operator is not discarded"],
      ["2*=", "2 ×", "a trailing times is not discarded"],
      ["2-=", "2 −", "a trailing minus is not discarded"],
      ["√=", "√", "a root with no number"],
      ["(=", "(", "a lone parenthesis"],
      ["2+(=", "2 + (", "an operator then an open group"],
      ["((1+2)=", "((1 + 2)", "one group left open"],
      ["2²+=", "2² +", "a trailing operator after a square"],
      ["5*√=", "5 × √", "a root with no number after an operator"],
    ])("%s -> %j (%s)", (keys, expression) => {
      const calculator = run(keys);
      expect(calculator.phase).toBe("error");
      expect(calculator.displayValue).toBe("Error");
      expect(calculator.expressionText).toBe(expression);
    });
  });

  describe("key sequences that would build a malformed expression are corrected by ignoring or replacing a key", () => {
    it.each([
      ["2+*3=", "6", "2 × 3 =", "the last operator wins"],
      ["2+-3=", "-1", "2 + −3 =", "a − after an operator is a sign, so + stays"],
      ["2*/3=", "0.666666666666667", "2 ÷ 3 =", "the last operator wins"],
      ["2+)3=", "5", "2 + 3 =", "a ) after an operator is ignored"],
      ["²5=", "5", "5 =", "a ² with nothing before it is ignored"],
      ["+5=", "5", "0 + 5 =", "a leading operator works on the 0 shown"],
      ["*5=", "0", "0 × 5 =", "a leading operator works on the 0 shown"],
      ["-5=", "-5", "−5 =", "a leading − is a sign (no 0 − 5)"],
      ["(+5)=", "5", "(5) =", "an operator right after ( is ignored"],
      ["2(+3)=", "6", "2 × (3) =", "an operator right after ( is ignored"],
      ["√+4=", "2", "√4 =", "an operator right after √ is ignored"],
      ["((1+2)))=", "3", "((1 + 2)) =", "a ) with nothing to close is ignored"],
    ])("%s -> %s", (keys, value, expression) => {
      const calculator = run(keys);
      expect(calculator.displayValue).toBe(value);
      expect(calculator.expressionText).toBe(expression);
    });
  });

  it("an empty pair of parentheses cannot be built", () => {
    expect(run("()").expressionText).toBe("(");
    expect(run("()5=").expressionText).toBe("(5");
    expect(run("()5=").phase).toBe("error");
  });
});

// ---------------------------------------------------------------- state transitions

describe("state transitions", () => {
  it.each([
    // [keys, phase, display, expression]
    ["", "building", "0", ""],
    ["5", "building", "5", "5"],
    ["5+", "building", "5", "5 +"],
    ["5+3", "building", "8", "5 + 3"],
    ["5+3=", "result", "8", "5 + 3 ="],
    ["5+3=C", "building", "0", ""],
    ["5+3=+", "building", "8", "8 +"],
    ["5+3=+2", "building", "10", "8 + 2"],
    ["5/0=", "error", "Error", "5 ÷ 0"],
    ["5/0=C", "building", "0", ""],
    ["(", "building", "0", "("],
    ["(5", "building", "5", "(5"],
    ["(5)", "building", "5", "(5)"],
    ["(5)=", "result", "5", "(5) ="],
    ["5²", "building", "25", "5²"],
    ["5²=", "result", "25", "5² ="],
    ["√", "building", "0", "√"],
    ["√9=", "result", "3", "√9 ="],
    ["50%", "building", "0.5", "0.5"],
    ["50%=", "result", "0.5", "0.5 ="],
  ])("%s -> %s, shows %s with %j", (keys, phase, display, expression) => {
    const calculator = run(keys);
    expect(calculator.phase).toBe(phase);
    expect(calculator.displayValue).toBe(display);
    expect(calculator.expressionText).toBe(expression);
  });

  describe("repeated keys", () => {
    it("repeated operators replace each other", () => {
      expect(run("5+++").expressionText).toBe("5 +");
      expect(run("5+-*/").expressionText).toBe("5 ÷");
      expect(resultOf("5+-*/5=")).toBe("1");
    });

    it("repeated squares stack", () => {
      expect(run("2²²²").expressionText).toBe("2²²²");
      expect(resultOf("2²²²=")).toBe("256");
    });

    it("repeated parentheses and roots stack", () => {
      expect(run("(((").expressionText).toBe("(((");
      expect(run("√√√").expressionText).toBe("√√√");
      expect(resultOf("√√√256=")).toBe("2");
    });

    it("repeated = and repeated AC change nothing more", () => {
      expect(run("2+3===").expressionText).toBe("2 + 3 =");
      expect(run("2+3=CCC").expressionText).toBe("");
    });

    it("repeated sign changes alternate", () => {
      expect(run("5S").displayValue).toBe("-5");
      expect(run("5SS").displayValue).toBe("5");
      expect(run("5SSS").displayValue).toBe("-5");
    });
  });

  describe("nesting limit", () => {
    const evaluatorLimit = MAX_NESTING_DEPTH;

    it(`stops adding ( after ${evaluatorLimit} levels, and = still works`, () => {
      const calculator = run("(".repeat(evaluatorLimit + 50));
      expect(calculator.expressionText).toBe("(".repeat(evaluatorLimit));

      press(calculator, `1${")".repeat(evaluatorLimit + 50)}=`);
      expect(calculator.displayValue).toBe("1");
      expect(calculator.phase).toBe("result");
    });

    it(`stops adding √ after ${evaluatorLimit} of them, and = still works`, () => {
      const calculator = run("√".repeat(evaluatorLimit + 50));
      expect(calculator.expressionText).toBe("√".repeat(evaluatorLimit));

      press(calculator, "1=");
      expect(calculator.displayValue).toBe("1");
    });

    it("counts groups and roots together, so the evaluator never has to refuse", () => {
      const calculator = run("(√".repeat(evaluatorLimit));
      press(calculator, `1${")".repeat(evaluatorLimit)}=`);
      expect(calculator.phase).toBe("result");
      expect(calculator.displayValue).toBe("1");
    });
  });
});

// ---------------------------------------------------------------- independence

describe("independence from the NORMAL calculator", () => {
  it("two PRO calculators do not share state", () => {
    const first = run("12+");
    const second = new ProCalculator();
    expect(second.displayValue).toBe("0");
    press(second, "7*");
    expect(first.expressionText).toBe("12 +");
    expect(second.expressionText).toBe("7 ×");
  });

  it("using PRO never changes a NORMAL engine", () => {
    const normal = new CalculatorEngine();
    for (const key of "123") normal.inputDigit(key);
    normal.setOperator("add");
    normal.inputDigit("4");

    const random = seeded(5);
    const keys = "0123456789.+-*/()²√S%=C";
    for (let sequence = 0; sequence < 300; sequence++) {
      const pro = new ProCalculator();
      for (let step = 0; step < 30; step++) press(pro, keys[Math.floor(random() * keys.length)]!);
    }

    expect(normal.displayValue).toBe("4");
    expect(normal.phase).toBe("entering");
    normal.equals();
    expect(normal.displayValue).toBe("127");
  });

  it("gives the same answers whatever else has run before (no hidden shared state)", () => {
    const keys = "2+3*(4-1)²=";
    const expected = [run(keys).displayValue, run(keys).expressionText];

    press(new ProCalculator(), "9/0=");
    press(new ProCalculator(), "(((√√");
    expect([run(keys).displayValue, run(keys).expressionText]).toEqual(expected);
  });

  it("evaluation and text come from the injected collaborators", () => {
    class FixedEvaluator extends ExpressionEvaluator {
      override evaluate(): EvaluationResult {
        return { ok: true, value: 42 };
      }
    }
    class FixedFormatter extends ExpressionFormatter {
      override format(): string {
        return "X";
      }
    }
    const calculator = press(new ProCalculator(new FixedEvaluator(), new FixedFormatter()), "1+1");
    expect(calculator.expressionText).toBe("X");

    press(calculator, "=");
    expect(calculator.displayValue).toBe("42");
    expect(calculator.expressionText).toBe("X =");
  });

  it("uses the injected evaluator for the left side of a percentage", () => {
    class FixedEvaluator extends ExpressionEvaluator {
      override evaluate(): EvaluationResult {
        return { ok: true, value: 50 };
      }
    }
    // the left side is "worked out" as 50, so 10% of it is 5
    expect(press(new ProCalculator(new FixedEvaluator()), "1+10%").expressionText).toBe("1 + 5");
  });

  describe("source", () => {
    const code = proSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it("has no eval, Function constructor or DOM access", () => {
      expect(code).not.toMatch(/\beval\s*\(/);
      expect(code).not.toMatch(/\bnew\s+Function\b/);
      for (const global of ["document", "window", "navigator", "localStorage", "HTMLElement"]) {
        expect(code, global).not.toMatch(new RegExp(`\\b${global}\\b`));
      }
    });

    it("imports only shared leaf modules and its sibling PRO modules", () => {
      const imported = [...proSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!).sort();
      expect(imported).toEqual([
        "../BasicCalculator",
        "../NumberEntry",
        "../NumberFormatter",
        "../Operator",
        "./ExpressionEvaluator",
        "./ExpressionFormatter",
        "./ExpressionToken",
      ]);
    });

    it("does not depend on the NORMAL engine, its state, the UI or the themes", () => {
      expect(proSource).not.toMatch(/CalculatorEngine|CalculatorState|InputHandler|CalculatorUI|ThemeManager|CalculatorApp/);
    });
  });
});

// ---------------------------------------------------------------- properties

/** Property tests run thousands of key sequences, so they are given more time than the 5 s default. */
const HEAVY_TEST_TIMEOUT = 60_000;

const KEYS = "0123456789012345.+-*/()()²√S%=C";

describe("random key presses", () => {
  it("never build a malformed expression, and never throw", () => {
    const random = seeded(20261022);
    const seen = { building: 0, result: 0, error: 0 };

    for (let sequence = 0; sequence < 3000; sequence++) {
      const calculator = new ProCalculator();
      const twin = new ProCalculator();

      for (let step = 0; step < 40; step++) {
        const key = KEYS[Math.floor(random() * KEYS.length)]!;
        press(calculator, key);
        press(twin, key);

        const { phase, displayValue, expressionText } = calculator;
        seen[phase]++;

        // the same keys always give the same answer
        expect([twin.displayValue, twin.expressionText, twin.phase]).toEqual([displayValue, expressionText, phase]);

        expect(displayValue).not.toBe("");
        expect(expressionText).toBe(expressionText.trim());

        if (phase === "building" && expressionText !== "") {
          const result = evaluator.evaluate(completed(reparse(expressionText)));
          expect(result.ok || result.failure === "math", `${expressionText}  after ${key}`).toBe(true);
        }
        if (phase === "error") expect(displayValue).toBe("Error");
      }
    }
    expect(seen.building).toBeGreaterThan(40000);
    expect(seen.result).toBeGreaterThan(500);
    expect(seen.error).toBeGreaterThan(500);
  }, HEAVY_TEST_TIMEOUT);

  it("show a result that its own expression evaluates to", () => {
    const random = seeded(99);
    let checked = 0;

    for (let sequence = 0; sequence < 4000; sequence++) {
      const calculator = new ProCalculator();

      for (let step = 0; step < 40; step++) {
        press(calculator, KEYS[Math.floor(random() * KEYS.length)]!);
        if (calculator.phase !== "result") continue;

        const shown = Number(calculator.displayValue);
        const again = evaluator.evaluate(reparse(calculator.expressionText.slice(0, -2)));
        expect(again.ok, calculator.expressionText).toBe(true);
        if (again.ok) expect(Math.abs(again.value - shown), calculator.expressionText).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(shown)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  }, HEAVY_TEST_TIMEOUT);
});

describe("agreement with NORMAL on a single operation", () => {
  /** operand: 1-4 digits, maybe a decimal point, maybe a sign, maybe a percent. */
  function operand(random: () => number): string {
    let keys = "";
    const length = 1 + Math.floor(random() * 4);
    for (let index = 0; index < length; index++) keys += String(Math.floor(random() * 10));
    if (random() < 0.3) keys += `.${Math.floor(random() * 10)}`;
    if (random() < 0.3) keys += "S";
    if (random() < 0.35) keys += "%";
    return keys;
  }

  it("gives the same result as NORMAL for 6000 random a ∘ b = (with decimals, signs and percentages)", () => {
    const random = seeded(31);
    const operators = "+-*/";
    let percentCases = 0;

    for (let index = 0; index < 6000; index++) {
      const keys = `${operand(random)}${operators[Math.floor(random() * 4)]}${operand(random)}=`;
      if (keys.includes("%")) percentCases++;

      expect(resultOf(keys), keys).toBe(normalResultOf(keys));
    }
    expect(percentCases).toBeGreaterThan(2000);
  }, HEAVY_TEST_TIMEOUT);
});
