import { describe, expect, it } from "vitest";
import { CalculatorEngine } from "../CalculatorEngine";
import { NormalCalculator } from "../NormalCalculator";
import type { Operator } from "../Operator";
import { ExpressionEvaluator, type EvaluationResult } from "./ExpressionEvaluator";
import type { ExpressionToken } from "./ExpressionToken";
import { ProCalculator } from "./ProCalculator";

const OPERATORS: Record<string, Operator> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };

/** Keys: digits . + - * / ( ) ² √  S (+/-)  % = C (AC). */
function press<T extends { inputDigit(d: string): void; inputDecimal(): void; setOperator(o: Operator): void }>(
  calculator: T,
  keys: string,
): T {
  const pro = calculator as unknown as ProCalculator;

  for (const key of keys) {
    if (/\d/.test(key)) calculator.inputDigit(key);
    else if (key === ".") calculator.inputDecimal();
    else if (key in OPERATORS) calculator.setOperator(OPERATORS[key]!);
    else if (key === "(") pro.openParenthesis();
    else if (key === ")") pro.closeParenthesis();
    else if (key === "²") pro.square();
    else if (key === "√") pro.squareRoot();
    else if (key === "S") pro.toggleSign();
    else if (key === "%") pro.percent();
    else if (key === "=") pro.equals();
    else if (key === "C") pro.clear();
    else throw new Error(`unknown key "${key}"`);
  }
  return calculator;
}

const run = (keys: string): ProCalculator => press(new ProCalculator(), keys);

describe("PRO live preview: the large display shows the value of the expression so far", () => {
  it("follows the worked example, key by key", () => {
    const calculator = new ProCalculator();
    const shown: Array<[string, string]> = [];

    for (const key of "5+2*3") {
      press(calculator, key);
      shown.push([calculator.displayValue, calculator.expressionText]);
    }

    expect(shown).toEqual([
      ["5", "5"],
      ["5", "5 +"],
      ["7", "5 + 2"],
      ["7", "5 + 2 ×"],
      ["11", "5 + 2 × 3"],
    ]);
  });

  it("= finalizes: the result stays and the expression keeps its completed form", () => {
    const calculator = run("5+2*3");
    expect(calculator.displayValue).toBe("11");

    calculator.equals();

    expect(calculator.displayValue).toBe("11");
    expect(calculator.expressionText).toBe("5 + 2 × 3 =");
    expect(calculator.phase).toBe("result");
  });

  describe("arithmetic and precedence", () => {
    it.each([
      ["5+2", "7"],
      ["5-2", "3"],
      ["5*2", "10"],
      ["5/2", "2.5"],
      ["5+2*3", "11"],
      ["5*2+3", "13"],
      ["2+3*4-6/2", "11"],
      ["10-2-3", "5"],
      ["0.1+0.2", "0.3"],
      ["5+0.5", "5.5"],
      ["100+200+300", "600"],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });
  });

  describe("parentheses", () => {
    it.each([
      ["(5+3)", "8"],
      ["(5+3)*2", "16"],
      ["2*(5+3)", "16"],
      ["((1+2)*(3+4))", "21"],
      ["((1+2)*(3+4))+5", "26"],
      ["2(3)", "6"],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });
  });

  describe("incomplete expressions keep the last valid value", () => {
    it.each([
      ["", "0"],
      ["5+", "5"],
      ["5+2*", "7"],
      ["5*", "5"],
      ["(", "0"],
      ["2*(", "2"],
      ["5+(", "5"],
      ["(5", "5"],
      ["(5+", "5"],
      ["(5+3", "8"],
      ["((2+3", "5"],
      ["((2+3)*", "5"],
      ["2*(3+4", "14"],
      ["√", "0"],
      ["5+√", "5"],
      ["5*√", "5"],
      ["-", "0"],
      ["5*-", "5"],
      ["5-", "5"],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });

    it("never repairs the expression: open groups are not closed in what is stored", () => {
      const calculator = run("(5+3");

      expect(calculator.displayValue).toBe("8");
      expect(calculator.expressionText).toBe("(5 + 3");

      press(calculator, ")*2");
      expect(calculator.displayValue).toBe("16");
      expect(calculator.expressionText).toBe("(5 + 3) × 2");
    });

    it("= on an unfinished expression is still an error", () => {
      expect(run("5+=").displayValue).toBe("Error");
      expect(run("(5+3=").displayValue).toBe("Error");
      expect(run("5*√=").displayValue).toBe("Error");
    });
  });

  describe("square and square root", () => {
    it.each([
      ["3²", "9"],
      ["2+3²", "11"],
      ["(2+3)²", "25"],
      ["2*3²+1", "19"],
      ["√9", "3"],
      ["√81", "9"],
      ["√9+16", "19"],
      ["√(9+16)", "5"],
      ["√(9+16", "5"],
      ["5+√9", "8"],
      ["√9+√16", "7"],
      ["√(9+7)²", "16"],
      ["2*√9", "6"],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });
  });

  describe("unary minus and negative numbers", () => {
    it.each([
      ["-5", "-5"],
      ["-5+2", "-3"],
      ["5*-2", "-10"],
      ["5+-2", "3"],
      ["-(2+3)", "-5"],
      ["-(2+3", "-5"],
      ["5*-(2+3)", "-25"],
      ["5S", "-5"],
      ["5S+2", "-3"],
      ["5+2S", "3"],
      ["(2+3)S", "-5"],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });
  });

  describe("percentages", () => {
    it.each([
      ["50%", "0.5"],
      ["200+10%", "220"],
      ["200-10%", "180"],
      ["200*10%", "20"],
      ["200/10%", "2000"],
      ["2+3*4+10%", "15.4"],
      ["5*(200+10%", "1100"],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });
  });

  describe("a lone number shows exactly as typed", () => {
    it.each([
      ["5.", "5."],
      ["0.50", "0.50"],
      ["007", "7"],
      ["5S", "-5"],
      [".", "0."],
    ])("%s -> %s", (keys, display) => {
      expect(run(keys).displayValue).toBe(display);
    });

    it("keeps the typed form while the number is the whole expression, and calculates once there is more", () => {
      expect(run("5.").displayValue).toBe("5.");
      expect(run("5.+2.").displayValue).toBe("7");
    });
  });

  describe("math failures never show an early Error", () => {
    it.each([
      ["5/0", "0"],
      ["5/0+3", "3"],
      ["1/(2-2", "2"],
      ["√(0-1", "1"],
      ["0/0", "0"],
    ])("%s keeps showing the last number (%s), still building", (keys, display) => {
      const calculator = run(keys);

      expect(calculator.displayValue).toBe(display);
      expect(calculator.phase).toBe("building");
    });

    it.each(["5/0=", "√(0-1)=", "1/(2-2)=", "0/0="])("%s reports Error only on =", (keys) => {
      const calculator = run(keys);

      expect(calculator.displayValue).toBe("Error");
      expect(calculator.phase).toBe("error");
    });

    it("the expression can be fixed after a failing preview", () => {
      const calculator = run("5/0");
      press(calculator, "C5/2=");
      expect(calculator.displayValue).toBe("2.5");
    });
  });

  describe("the preview is read-only", () => {
    it("reading the display does not change the expression, the phase or later results", () => {
      const calculator = run("(5+3");
      const before = [calculator.expressionText, calculator.phase];

      for (let read = 0; read < 3; read++) expect(calculator.displayValue).toBe("8");

      expect([calculator.expressionText, calculator.phase]).toEqual(before);
      press(calculator, ")*2=");
      expect(calculator.displayValue).toBe("16");
      expect(calculator.expressionText).toBe("(5 + 3) × 2 =");
    });

    it("evaluates with the injected ExpressionEvaluator, on a copy that the state does not share", () => {
      const seen: ExpressionToken[][] = [];
      class SpyEvaluator extends ExpressionEvaluator {
        override evaluate(tokens: readonly ExpressionToken[]): EvaluationResult {
          seen.push([...tokens]);
          return super.evaluate(tokens);
        }
      }
      const calculator = press(new ProCalculator(new SpyEvaluator()), "(5+3");
      seen.length = 0;

      expect(calculator.displayValue).toBe("8");

      expect(seen).toHaveLength(1);
      expect(seen[0]!.map((token) => token.kind)).toEqual(["open", "number", "operator", "number", "close"]);
      expect(calculator.expressionText).toBe("(5 + 3");
    });

    it("never evaluates on a result or an error (the stored value is shown)", () => {
      let calls = 0;
      class CountingEvaluator extends ExpressionEvaluator {
        override evaluate(tokens: readonly ExpressionToken[]): EvaluationResult {
          calls++;
          return super.evaluate(tokens);
        }
      }
      const calculator = press(new ProCalculator(new CountingEvaluator()), "2+3=");
      calls = 0;

      expect(calculator.displayValue).toBe("5");
      expect(calls).toBe(0);
    });
  });

  describe("AC and continuing from a result", () => {
    it("AC returns the display to 0", () => {
      expect(run("5+2C").displayValue).toBe("0");
    });

    it("an operator after = carries the result on, and the preview follows", () => {
      const calculator = run("5+2=*");
      expect(calculator.displayValue).toBe("7");
      press(calculator, "3");
      expect(calculator.displayValue).toBe("21");
    });

    it("a digit after = starts again", () => {
      expect(run("5+2=9").displayValue).toBe("9");
    });
  });
});

describe("NORMAL previews too, but keeps its left-to-right rules (see NormalLivePreview.test.ts)", () => {
  const normal = (keys: string): NormalCalculator => press(new NormalCalculator(new CalculatorEngine()), keys);

  it.each([
    ["5+2", "7"],
    ["5+", "5"],
    ["2+3*4", "20"],
    ["2+3*4=", "20"],
  ])("%s -> %s", (keys, display) => {
    expect(normal(keys).displayValue).toBe(display);
  });
});

describe("each calculator keeps its own preview", () => {
  it("PRO's live value is independent of a NORMAL calculator driven with the same keys", () => {
    const pro = run("5+2*3");
    const normalCalculator = press(new NormalCalculator(new CalculatorEngine()), "5+2*3");

    expect(pro.displayValue).toBe("11");
    expect(normalCalculator.displayValue).toBe("21");
    expect(run("5+2*3").displayValue).toBe(pro.displayValue);
  });
});
