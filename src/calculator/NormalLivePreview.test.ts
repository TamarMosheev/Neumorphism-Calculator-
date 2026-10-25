import { describe, expect, it } from "vitest";
import { CalculatorEngine } from "./CalculatorEngine";
import { NormalCalculator } from "./NormalCalculator";
import type { Operator } from "./Operator";
import { ProCalculator } from "./pro/ProCalculator";

const OPERATORS: Record<string, Operator> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };

/** Keys: digits . + - * /  S (+/-)  % = C (AC). */
function press(calculator: NormalCalculator | CalculatorEngine | ProCalculator, keys: string): void {
  for (const key of keys) {
    if (/\d/.test(key)) calculator.inputDigit(key);
    else if (key === ".") calculator.inputDecimal();
    else if (key === "=") calculator.equals();
    else if (key === "C") calculator.clear();
    else if (key === "S") calculator.toggleSign();
    else if (key === "%") calculator.percent();
    else calculator.setOperator(OPERATORS[key]!);
  }
}

const normal = (keys: string): NormalCalculator => {
  const calculator = new NormalCalculator();
  press(calculator, keys);
  return calculator;
};

const pro = (keys: string): ProCalculator => {
  const calculator = new ProCalculator();
  press(calculator, keys);
  return calculator;
};

describe("NORMAL live preview: the large display shows the value so far, left to right", () => {
  it("follows 5 + 2, key by key", () => {
    const calculator = new NormalCalculator();
    const shown: Array<[string, string]> = [];

    for (const key of "5+2") {
      press(calculator, key);
      shown.push([calculator.displayValue, calculator.expressionText]);
    }

    expect(shown).toEqual([
      ["5", "5"],
      ["5", "5 +"],
      ["7", "5 + 2"],
    ]);
  });

  it("NORMAL goes left to right and PRO applies precedence, from the same keys", () => {
    expect(normal("2+3*4").displayValue).toBe("20");
    expect(pro("2+3*4").displayValue).toBe("14");

    expect(normal("10-3*2").displayValue).toBe("14");
    expect(pro("10-3*2").displayValue).toBe("4");
  });

  it.each([
    ["5+2", "7"],
    ["5-2", "3"],
    ["5*2", "10"],
    ["5/2", "2.5"],
    ["2+3*", "5"],
    ["2+3*4", "20"],
    ["2+3*4+1", "21"],
    ["10-3*2", "14"],
    ["10-3*2/7", "2"],
    ["1+2+3+4", "10"],
    ["100/4/5", "5"],
    ["0.1+0.2", "0.3"],
  ])("%s -> %s", (keys, display) => {
    expect(normal(keys).displayValue).toBe(display);
  });

  it.each([
    ["200+10%", "220"],
    ["200-10%", "180"],
    ["200*10%", "20"],
    ["200/10%", "2000"],
    ["50%", "0.5"],
    ["2+3*4+10%", "22"],
  ])("percent keeps its contextual meaning: %s -> %s", (keys, display) => {
    expect(normal(keys).displayValue).toBe(display);
  });

  describe("a lone number shows exactly as typed", () => {
    it.each([
      ["5", "5"],
      ["5.", "5."],
      ["0.50", "0.50"],
      ["2.500", "2.500"],
      ["007", "7"],
      [".", "0."],
      ["5S", "-5"],
      ["0.50S", "-0.50"],
    ])("%s -> %s", (keys, display) => {
      expect(normal(keys).displayValue).toBe(display);
    });

    it("once there is an operator the value so far is shown instead", () => {
      expect(normal("5.+2.").displayValue).toBe("7");
      expect(normal("1.50+1.50").displayValue).toBe("3");
    });
  });

  describe("negative numbers", () => {
    it.each([
      ["5S+2", "-3"],
      ["5+2S", "3"],
      ["5+2SS", "7"],
      ["5S*2S", "10"],
      ["2-5", "-3"],
      ["2-5S", "7"],
      ["5S", "-5"],
    ])("%s -> %s", (keys, display) => {
      expect(normal(keys).displayValue).toBe(display);
    });
  });

  describe("incomplete expressions never show an early Error", () => {
    it.each([
      ["", "0"],
      ["+", "0"],
      ["5+", "5"],
      ["5+*", "5"],
      ["5+2*", "7"],
      ["5+%", "5"],
      ["5+S", "5"],
    ])("%s -> %s", (keys, display) => {
      expect(normal(keys).displayValue).toBe(display);
    });

    it("a division by zero keeps showing the operand until = reports it", () => {
      const calculator = normal("5/0");

      expect(calculator.displayValue).toBe("0");
      expect(calculator.expressionText).toBe("5 ÷ 0");

      calculator.equals();
      expect(calculator.displayValue).toBe("Error");
    });

    it("chaining through a failing step is the engine's own Error, as before", () => {
      expect(normal("5/0+").displayValue).toBe("Error");
      expect(normal("5/0=").displayValue).toBe("Error");
    });

    it("recovers from an error with a digit or AC", () => {
      expect(normal("5/0=7").displayValue).toBe("7");
      expect(normal("5/0=C").displayValue).toBe("0");
      expect(normal("5/0=3+4").displayValue).toBe("7");
    });
  });

  describe("= finalizes with the existing engine", () => {
    it.each([
      ["5+2=", "7"],
      ["2+3*4=", "20"],
      ["10-3*2=", "14"],
      ["200+10%=", "220"],
      ["7+=", "14"],
    ])("%s -> %s", (keys, display) => {
      expect(normal(keys).displayValue).toBe(display);
    });

    it("keeps the completed expression", () => {
      expect(normal("2+3*4=").expressionText).toBe("2 + 3 × 4 =");
    });

    it("what the preview promised is what = shows, over random key presses", () => {
      const keys = "0123456789.+-*/%S";
      let seed = 77;
      const random = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      let checked = 0;

      for (let sequence = 0; sequence < 2000; sequence++) {
        const calculator = new NormalCalculator();
        for (let step = 0; step < 12; step++) press(calculator, keys[Math.floor(random() * keys.length)]!);

        const promised = calculator.displayValue;
        const finished = calculator.expressionText;
        calculator.equals();

        // "=" with an operator but no second number uses the shown number again (7 + = is 14), and with
        // nothing pending it changes nothing; every other "=" must show exactly what the preview promised
        if (/[+−×÷]$/.test(finished) || !/[+−×÷]/.test(finished)) continue;

        // the only thing a preview cannot promise is a failure: a division by zero is reported by "=" alone
        if (calculator.displayValue === "Error") {
          expect(finished).toContain("÷");
          continue;
        }
        expect({ finished, shown: calculator.displayValue }).toEqual({ finished, shown: promised });
        checked++;
      }
      expect(checked).toBeGreaterThan(100);
    });
  });

  describe("AC and continuing after =", () => {
    it("AC returns to 0 with an empty expression", () => {
      const calculator = normal("5+2C");

      expect(calculator.displayValue).toBe("0");
      expect(calculator.expressionText).toBe("");
    });

    it("an operator after = carries the result on, and the preview follows", () => {
      const calculator = normal("5+2=*");
      expect(calculator.displayValue).toBe("7");

      press(calculator, "3");
      expect(calculator.displayValue).toBe("21");
      expect(calculator.expressionText).toBe("7 × 3");
    });

    it("a digit after = starts again", () => {
      expect(normal("5+2=9").displayValue).toBe("9");
    });

    it("+/- on a result negates it", () => {
      expect(normal("5+2=S").displayValue).toBe("-7");
    });
  });
});

describe("the preview is read-only", () => {
  it("reading it does not change the engine, its operand or the next result", () => {
    const engine = new CalculatorEngine();
    press(engine, "2+3*4");
    const before = [engine.displayValue, engine.phase];

    for (let read = 0; read < 3; read++) expect(engine.previewValue).toBe("20");

    expect([engine.displayValue, engine.phase]).toEqual(before);
    engine.equals();
    expect(engine.displayValue).toBe("20");
  });

  it("the engine's own display is still the operand being entered", () => {
    const engine = new CalculatorEngine();
    press(engine, "5+2");

    expect(engine.displayValue).toBe("2");
    expect(engine.previewValue).toBe("7");
  });

  it("matches the display outside a pending operation", () => {
    for (const keys of ["", "5", "5.", "5+", "5+2=", "5/0=", "5S"]) {
      const engine = new CalculatorEngine();
      press(engine, keys);
      expect(engine.previewValue).toBe(engine.displayValue);
    }
  });
});
