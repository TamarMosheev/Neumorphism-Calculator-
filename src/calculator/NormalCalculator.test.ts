import { describe, expect, it } from "vitest";
import normalCalculatorSource from "./NormalCalculator.ts?raw";
import { CalculatorEngine } from "./CalculatorEngine";
import { NormalCalculator } from "./NormalCalculator";
import type { Operator } from "./Operator";

const OPERATORS: Record<string, Operator> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };

/** One key press: digits, "." decimal, + - * / operators, = equals, C clear, S sign, % percent. */
function press(calculator: NormalCalculator | CalculatorEngine, key: string): void {
  if (/\d/.test(key)) calculator.inputDigit(key);
  else if (key === ".") calculator.inputDecimal();
  else if (key === "=") calculator.equals();
  else if (key === "C") calculator.clear();
  else if (key === "S") calculator.toggleSign();
  else if (key === "%") calculator.percent();
  else calculator.setOperator(OPERATORS[key]!);
}

const keysOf = (keys: string): string[] => [...keys.replace(/\s+/g, "")];

/** [expression, display] after each key. */
function trail(keys: string, calculator = new NormalCalculator()): [string, string][] {
  return keysOf(keys).map((key) => {
    press(calculator, key);
    return [calculator.expressionText, calculator.displayValue];
  });
}

function after(keys: string, calculator = new NormalCalculator()): { expression: string; display: string } {
  for (const key of keysOf(keys)) press(calculator, key);
  return { expression: calculator.expressionText, display: calculator.displayValue };
}

describe("a fresh NORMAL calculator", () => {
  it("has an empty expression and shows 0", () => {
    const calculator = new NormalCalculator();

    expect(calculator.expressionText).toBe("");
    expect(calculator.displayValue).toBe("0");
  });
});

describe("the expression while typing, left to right", () => {
  it("2 + 3 × 4 = shows every step and ends with 20", () => {
    expect(trail("2+3*4=")).toEqual([
      ["2", "2"],
      ["2 +", "2"],
      ["2 + 3", "5"],
      ["2 + 3 ×", "5"],
      ["2 + 3 × 4", "20"],
      ["2 + 3 × 4 =", "20"],
    ]);
  });

  it("8 ÷ 2 = is 4", () => {
    expect(after("8/2=")).toEqual({ expression: "8 ÷ 2 =", display: "4" });
  });

  it("uses the same symbols as PRO: + − × ÷", () => {
    expect(after("9-4*2/5").expression).toBe("9 − 4 × 2 ÷ 5");
  });

  it("a number being typed is part of the expression at once", () => {
    expect(trail("12+345").map(([expression]) => expression)).toEqual(["1", "12", "12 +", "12 + 3", "12 + 34", "12 + 345"]);
  });

  it("keeps trailing decimal zeros while typing, as the display does", () => {
    expect(trail("2.50").map(([expression]) => expression)).toEqual(["2", "2.", "2.5", "2.50"]);
    expect(after("2.50+1.0").expression).toBe("2.50 + 1.0");
  });

  it("a decimal point first starts 0.", () => {
    expect(after(".5").expression).toBe("0.5");
    expect(after("3+.").expression).toBe("3 + 0.");
  });

  it("an operator pressed twice: the last one wins", () => {
    expect(after("5+*").expression).toBe("5 ×");
  });

  it("an operator first uses the 0 on the display", () => {
    expect(after("+").expression).toBe("0 +");
    expect(after("+5=").expression).toBe("0 + 5 =");
  });

  it("no leading zeros: typing 0 then 5 shows 5", () => {
    expect(after("05").expression).toBe("5");
  });

  it("a digit past the 15-digit limit is ignored, in the expression too", () => {
    const calculator = new NormalCalculator();
    for (let i = 0; i < 15; i++) calculator.inputDigit("1");
    const full = calculator.expressionText;

    calculator.inputDigit("2");

    expect(calculator.expressionText).toBe(full);
    expect(calculator.displayValue).toBe("111111111111111");
  });
});

describe("percent keeps its contextual meaning, and the expression shows what was pressed", () => {
  it("200 + 10 % = 220", () => {
    expect(trail("200+10%=").map(([expression, display]) => `${expression} → ${display}`)).toEqual([
      "2 → 2",
      "20 → 20",
      "200 → 200",
      "200 + → 200",
      "200 + 1 → 201",
      "200 + 10 → 210",
      "200 + 10% → 220",
      "200 + 10% = → 220",
    ]);
  });

  it("200 − 10 % = 180", () => {
    expect(after("200-10%=")).toEqual({ expression: "200 − 10% =", display: "180" });
  });

  it("200 × 10 % = 20 (a plain fraction after × )", () => {
    expect(after("200*10%")).toEqual({ expression: "200 × 10%", display: "20" });
    expect(after("200*10%=")).toEqual({ expression: "200 × 10% =", display: "20" });
  });

  it("a lone 50 % is 0.5", () => {
    expect(after("50%")).toEqual({ expression: "50%", display: "0.5" });
  });

  it("% on a result converts the result: 2 + 3 = % is 5%, shown as 0.05", () => {
    expect(after("2+3=%")).toEqual({ expression: "5%", display: "0.05" });
  });

  it("% right after an operator does nothing", () => {
    expect(after("5+%")).toEqual({ expression: "5 +", display: "5" });
  });

  it("typing after % replaces the percentage value", () => {
    expect(after("200+10%5")).toEqual({ expression: "200 + 5", display: "205" });
  });
});

describe("+/− negates the number being entered, and the expression follows", () => {
  it("5 +/− is −5", () => {
    expect(after("5S")).toEqual({ expression: "−5", display: "-5" });
  });

  it("2 + 3 +/− is 2 + −3, and again is 2 + 3", () => {
    expect(after("2+3S")).toEqual({ expression: "2 + −3", display: "-1" });
    expect(after("2+3SS")).toEqual({ expression: "2 + 3", display: "5" });
    expect(after("2+3S=")).toEqual({ expression: "2 + −3 =", display: "-1" });
  });

  it("does nothing for zero, or while waiting for the second number", () => {
    expect(after("S")).toEqual({ expression: "", display: "0" });
    expect(after("5+S")).toEqual({ expression: "5 +", display: "5" });
  });

  it("negates a result: 2 + 3 = +/− is −5, which then carries on", () => {
    expect(after("2+3=S")).toEqual({ expression: "−5", display: "-5" });
    expect(after("2+3=S+1=")).toEqual({ expression: "−5 + 1 =", display: "-4" });
  });

  it("negates a percentage: 200 + 10 % +/− is 200 + −10%, which is 180", () => {
    expect(after("200+10%S")).toEqual({ expression: "200 + −10%", display: "180" });
    expect(after("200+10%S=")).toEqual({ expression: "200 + −10% =", display: "180" });
  });
});

describe("= and what comes after it", () => {
  it("keeps the whole expression and shows the result", () => {
    expect(after("2+3*4=")).toEqual({ expression: "2 + 3 × 4 =", display: "20" });
  });

  it("an operator after = carries the result on: 2 + 3 = × 4 = is 5 × 4 = 20", () => {
    expect(after("2+3=*")).toEqual({ expression: "5 ×", display: "5" });
    expect(after("2+3=*4=")).toEqual({ expression: "5 × 4 =", display: "20" });
  });

  it("a digit after = starts a new expression", () => {
    expect(after("2+3=7")).toEqual({ expression: "7", display: "7" });
    expect(after("2+3=7+1=")).toEqual({ expression: "7 + 1 =", display: "8" });
  });

  it("a decimal point after = starts a new 0.", () => {
    expect(after("2+3=.")).toEqual({ expression: "0.", display: "0." });
  });

  it("= with no operator does nothing: 5 = stays 5", () => {
    expect(after("5=")).toEqual({ expression: "5", display: "5" });
  });

  it("= pressed again on a result does nothing", () => {
    expect(after("2+3==")).toEqual({ expression: "2 + 3 =", display: "5" });
  });

  it("an operator with no second number uses the displayed one: 7 + = is 7 + 7 = 14", () => {
    expect(after("7+=")).toEqual({ expression: "7 + 7 =", display: "14" });
  });

  it("after a chained operator, = uses the running total: 2 + 3 × = is 2 + 3 × 5 = 25", () => {
    expect(after("2+3*=")).toEqual({ expression: "2 + 3 × 5 =", display: "25" });
  });
});

describe("AC", () => {
  it("clears the expression and shows 0, at every stage", () => {
    for (const keys of ["2", "2+", "2+3", "2+3=", "200+10%", "5/0=", "2+3S"]) {
      const calculator = new NormalCalculator();
      after(keys, calculator);

      calculator.clear();

      expect(calculator.expressionText, keys).toBe("");
      expect(calculator.displayValue, keys).toBe("0");
    }
  });

  it("works for a fresh calculation afterwards", () => {
    expect(after("2+3*4=C8/2=")).toEqual({ expression: "8 ÷ 2 =", display: "4" });
  });
});

describe("errors keep the expression readable, and recovery is clean", () => {
  it("5 ÷ 0 = shows Error with the expression 5 ÷ 0 =", () => {
    expect(after("5/0=")).toEqual({ expression: "5 ÷ 0 =", display: "Error" });
  });

  it("an error in the middle of a chain: 5 ÷ 0 + shows what was entered", () => {
    expect(after("5/0+")).toEqual({ expression: "5 ÷ 0 +", display: "Error" });
  });

  it("operators, =, % and +/− are ignored in error, and change nothing", () => {
    const calculator = new NormalCalculator();
    after("5/0=", calculator);

    for (const key of ["+", "*", "=", "%", "S"]) press(calculator, key);

    expect(calculator.expressionText).toBe("5 ÷ 0 =");
    expect(calculator.displayValue).toBe("Error");
  });

  it("a digit recovers: a new expression starts clean", () => {
    expect(after("5/0=3")).toEqual({ expression: "3", display: "3" });
    expect(after("5/0=3+4=")).toEqual({ expression: "3 + 4 =", display: "7" });
  });

  it("AC recovers too", () => {
    expect(after("5/0=C2+2=")).toEqual({ expression: "2 + 2 =", display: "4" });
  });

  it("a decimal point recovers", () => {
    expect(after("5/0=.5")).toEqual({ expression: "0.5", display: "0.5" });
  });
});

describe("NORMAL stays a standard calculator", () => {
  it("never writes parentheses, squares or roots, whatever is pressed", () => {
    const keys = "0123456789.+-*/=%SC";
    let seed = 7;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let sequence = 0; sequence < 500; sequence++) {
      const calculator = new NormalCalculator();
      for (let step = 0; step < 25; step++) {
        press(calculator, keys[Math.floor(random() * keys.length)]!);
        const text = calculator.expressionText;
        if (/[()²√]/.test(text)) expect(text).not.toMatch(/[()²√]/);
      }
    }
  });

  it("has no scientific operations of its own", () => {
    for (const name of ["openParenthesis", "closeParenthesis", "square", "squareRoot"]) {
      expect(name in new NormalCalculator()).toBe(false);
    }
  });
});

describe("the numbers are still the existing engine's: tracking the expression changes nothing", () => {
  it("shows exactly what a bare CalculatorEngine previews after every key, over random key presses", () => {
    const keys = "0123456789..+-*/==%SC";
    let seed = 20261024;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let compared = 0;

    for (let sequence = 0; sequence < 3000; sequence++) {
      const tracked = new NormalCalculator();
      const bare = new CalculatorEngine();

      for (let step = 0; step < 30; step++) {
        const key = keys[Math.floor(random() * keys.length)]!;
        press(tracked, key);
        press(bare, key);

        // asserted only on a mismatch: ~90,000 passing expect() calls would be slow and add nothing
        if (tracked.displayValue !== bare.previewValue) expect({ key, tracked: tracked.displayValue }).toEqual({ key, tracked: bare.previewValue });
        compared++;
      }
    }
    expect(compared).toBe(90_000);
  });

  it("an expression, when finished, always ends with = exactly when the engine produced a result", () => {
    const keys = "0123456789.+-*/=%SC";
    let seed = 99;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let sequence = 0; sequence < 1500; sequence++) {
      const tracked = new NormalCalculator();
      const bare = new CalculatorEngine();

      for (let step = 0; step < 25; step++) {
        const key = keys[Math.floor(random() * keys.length)]!;
        press(tracked, key);
        press(bare, key);

        const text = tracked.expressionText;
        const hasEquals = text.endsWith(" =");
        // an "=" is only ever written for a calculation the engine finished (a result or an error from =)
        if (hasEquals && bare.phase !== "result" && bare.phase !== "error") expect({ text, phase: bare.phase }).toEqual({ text: "", phase: "result" });
        if (text.includes("=") && !hasEquals) expect(text).not.toContain("=");
      }
    }
  });
});

describe("the class is independent of the DOM", () => {
  it("uses no browser globals", () => {
    const code = normalCalculatorSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    for (const global of ["document", "window", "navigator", "localStorage", "HTMLElement"]) {
      expect(code, global).not.toMatch(new RegExp(`\\b${global}\\b`));
    }
  });

  it("imports only calculator modules", () => {
    const imported = [...normalCalculatorSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!).sort();

    expect(imported).toEqual(["./BasicCalculator", "./CalculatorEngine", "./CalculatorState", "./Operator"]);
  });
});
