import { beforeEach, describe, expect, it } from "vitest";
import { CalculatorEngine } from "./CalculatorEngine";
import type { Operator } from "./Operator";

const OPERATOR_KEYS: Record<string, Operator> = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
};

/** Feeds a space-separated key sequence, e.g. "2 + 3 =", and returns the display. */
function press(engine: CalculatorEngine, keys: string): string {
  for (const key of keys.split(" ")) {
    if (key === "=") engine.equals();
    else if (key === "C") engine.clear();
    else if (key === ".") engine.inputDecimal();
    else if (key === "S") engine.toggleSign();
    else if (key === "%") engine.percent();
    else if (key in OPERATOR_KEYS) engine.setOperator(OPERATOR_KEYS[key]);
    else engine.inputDigit(key);
  }
  return engine.displayValue;
}

describe("CalculatorEngine", () => {
  let engine: CalculatorEngine;

  beforeEach(() => {
    engine = new CalculatorEngine();
  });

  describe("number entry", () => {
    it("starts at 0", () => expect(engine.displayValue).toBe("0"));
    it("builds multi-digit numbers", () => expect(press(engine, "1 2 3")).toBe("123"));
    it("avoids leading zeros", () => expect(press(engine, "0 0 5")).toBe("5"));
    it("ignores non-digit input", () => {
      engine.inputDigit("a");
      engine.inputDigit("12");
      expect(engine.displayValue).toBe("0");
    });
  });

  describe("decimals", () => {
    it("starts a decimal from zero", () => expect(press(engine, ".")).toBe("0."));
    it("appends after a digit", () => expect(press(engine, "5 . 7")).toBe("5.7"));
    it("allows only one decimal point", () => expect(press(engine, "5 . 7 . 3")).toBe("5.73"));
    it("keeps trailing zeros", () => expect(press(engine, "2 . 0 0")).toBe("2.00"));
  });

  describe("arithmetic", () => {
    it.each([
      ["2 + 3 =", "5"],
      ["9 - 1 2 =", "-3"],
      ["6 * 7 =", "42"],
      ["8 / 4 =", "2"],
      ["1 / 4 =", "0.25"],
      ["2 . 5 * 2 =", "5"],
      ["0 . 5 - 2 =", "-1.5"],
      ["0 . 1 + 0 . 2 =", "0.3"],
      ["1 / 3 =", "0.333333333333333"],
      ["0 * 5 =", "0"],
    ])("%s -> %s", (keys, expected) => {
      expect(press(engine, keys)).toBe(expected);
    });

    it("does not show negative zero", () => {
      expect(press(engine, "0 - 0 * 1 =")).toBe("0");
    });
  });

  describe("operator behaviour", () => {
    it("keeps showing the first operand right after an operator", () => {
      expect(press(engine, "5 +")).toBe("5");
    });

    it("starts a new operand after an operator", () => {
      press(engine, "5 +");
      expect(press(engine, "3")).toBe("3");
      expect(press(engine, "=")).toBe("8");
    });

    it("chains left to right", () => expect(press(engine, "2 + 3 * 4 =")).toBe("20"));
    it("shows the running result when chaining", () => expect(press(engine, "2 + 3 +")).toBe("5"));
    it("lets the last of consecutive operators win", () => expect(press(engine, "2 + * 3 =")).toBe("6"));
    it("ignores = with no pending operator", () => expect(press(engine, "7 =")).toBe("7"));
    it("starts a decimal operand after an operator", () => expect(press(engine, "5 + .")).toBe("0."));
  });

  describe("after a result", () => {
    it("starts a new calculation on a digit", () => {
      expect(press(engine, "2 + 3 = 4")).toBe("4");
      expect(press(engine, "+ 1 =")).toBe("5");
    });

    it("starts a new calculation on a decimal", () => {
      expect(press(engine, "2 + 3 = .")).toBe("0.");
    });

    it("continues with the result when an operator follows", () => {
      expect(press(engine, "2 + 3 = + 4 =")).toBe("9");
    });
  });

  describe("sign toggle (S)", () => {
    it("makes a positive number negative", () => expect(press(engine, "5 S")).toBe("-5"));
    it("makes a negative number positive", () => expect(press(engine, "5 S S")).toBe("5"));
    it("keeps zero as 0", () => expect(press(engine, "S")).toBe("0"));
    it("keeps zero as 0 after toggling twice", () => expect(press(engine, "0 S S")).toBe("0"));
    it("handles multi-digit numbers", () => expect(press(engine, "1 2 3 S")).toBe("-123"));
    it("keeps a trailing decimal point", () => expect(press(engine, "5 . S")).toBe("-5."));
    it("keeps trailing zeros", () => expect(press(engine, "2 . 0 0 S")).toBe("-2.00"));
    it("negates a decimal number", () => expect(press(engine, "0 . 5 S")).toBe("-0.5"));
    it("allows typing to continue after negating", () => {
      expect(press(engine, "5 S 3")).toBe("-53");
      expect(press(engine, ". 5")).toBe("-53.5");
    });
    it("does not alter zero-valued decimals", () => expect(press(engine, "0 . 0 S")).toBe("0.0"));

    it("negates the second operand", () => expect(press(engine, "5 + 3 S =")).toBe("2"));
    it("negates the first operand before an operator", () => expect(press(engine, "5 S + 3 =")).toBe("-2"));
    it("does nothing right after an operator", () => {
      expect(press(engine, "5 + S")).toBe("5");
      expect(press(engine, "3 =")).toBe("8");
    });
    it("negates a result", () => expect(press(engine, "2 + 3 = S")).toBe("-5"));
    it("continues from a negated result", () => expect(press(engine, "2 + 3 = S + 1 =")).toBe("-4"));
    it("starts fresh when a digit follows a negated result", () => {
      expect(press(engine, "2 + 3 = S 7")).toBe("7");
    });
    it("multiplies by a negated operand", () => expect(press(engine, "4 * 2 S =")).toBe("-8"));
    it("is ignored while in error", () => expect(press(engine, "5 / 0 = S")).toBe("Error"));
    it("is reset by AC", () => expect(press(engine, "5 S C 4")).toBe("4"));
  });

  describe("percentage (%)", () => {
    it.each([
      ["5 0 %", "0.5"],
      ["1 0 0 %", "1"],
      ["5 %", "0.05"],
      ["0 %", "0"],
      ["2 . 5 %", "0.025"],
      ["5 0 S %", "-0.5"],
      ["2 0 0 * 1 0 % =", "20"],
      ["2 0 0 + 1 0 % =", "220"],
      ["2 0 0 - 1 0 % =", "180"],
      ["2 0 0 / 1 0 % =", "2000"],
      ["2 0 0 + 1 0 %", "20"],
      ["2 0 0 * 1 0 %", "0.1"],
      ["2 0 0 + 2 . 5 % =", "205"],
      ["2 0 0 + 1 0 S % =", "180"],
      ["2 0 0 - 1 0 S % =", "220"],
      ["2 0 0 S + 1 0 % =", "-220"],
      ["2 0 0 * 1 0 S % =", "-20"],
      ["8 0 + 0 % =", "80"],
    ])("%s -> %s", (keys, expected) => {
      expect(press(engine, keys)).toBe(expected);
    });

    it("replaces the computed value when a digit follows", () => {
      press(engine, "2 0 0 + 1 0 %");
      expect(press(engine, "5")).toBe("5");
      expect(press(engine, "=")).toBe("205");
    });

    it("starts a new calculation when a digit follows a standalone percent", () => {
      expect(press(engine, "5 0 % 7")).toBe("7");
    });

    it("continues from a standalone percent when an operator follows", () => {
      expect(press(engine, "5 0 % * 4 =")).toBe("2");
    });

    it("works on a result", () => expect(press(engine, "2 + 3 = %")).toBe("0.05"));

    it("does nothing right after an operator", () => {
      expect(press(engine, "2 0 0 + %")).toBe("200");
      expect(press(engine, "1 0 =")).toBe("210");
    });

    it("chains normally after a percent operand", () => {
      expect(press(engine, "2 0 0 + 1 0 % + 5 =")).toBe("225");
    });

    it("is ignored while in error", () => expect(press(engine, "5 / 0 = %")).toBe("Error"));
    it("is reset by AC", () => expect(press(engine, "5 0 % C 4")).toBe("4"));
  });

  describe("division by zero", () => {
    it("shows Error", () => expect(press(engine, "5 / 0 =")).toBe("Error"));
    it("shows Error when chaining into it", () => expect(press(engine, "5 / 0 +")).toBe("Error"));
    it("ignores operators and = while in error", () => {
      press(engine, "5 / 0 =");
      expect(press(engine, "+ =")).toBe("Error");
    });
    it("recovers on the next digit", () => {
      press(engine, "5 / 0 =");
      expect(press(engine, "7")).toBe("7");
      expect(press(engine, "+ 1 =")).toBe("8");
    });
    it("recovers on AC", () => expect(press(engine, "5 / 0 = C")).toBe("0"));
  });

  describe("clear", () => {
    it("resets entry", () => expect(press(engine, "1 2 3 C")).toBe("0"));
    it("resets a pending operation", () => {
      press(engine, "5 + 3 C");
      expect(press(engine, "4 =")).toBe("4");
    });
    it("resets a shown result", () => {
      press(engine, "2 + 3 = C");
      expect(press(engine, "+ 1 =")).toBe("1");
    });
  });

  describe("edge cases", () => {
    it.each([
      ["3 S * 4 S =", "12"],
      ["0 / 5 =", "0"],
      ["5 - 5 =", "0"],
      ["7 . 0 + 1 =", "8"],
      ["5 + . 5 =", "5.5"],
      ["0 . 1 * 0 . 1 =", "0.01"],
      ["0 . 0 0 5", "0.005"],
      ["2 + 3 = =", "5"],
      ["2 + 3 = S S", "5"],
    ])("%s -> %s", (keys, expected) => {
      expect(press(engine, keys)).toBe(expected);
    });

    it("treats 0 / 0 as an error", () => expect(press(engine, "0 / 0 =")).toBe("Error"));
    it("applies % repeatedly (50% -> 0.5% )", () => expect(press(engine, "5 0 % %")).toBe("0.005"));
    it("negates a percent result", () => expect(press(engine, "5 0 % S")).toBe("-0.5"));
    it("applies % to a negated number", () => expect(press(engine, "5 0 S %")).toBe("-0.5"));
    it("keeps working after an error is cleared by a digit", () => {
      expect(press(engine, "5 / 0 = + 3 =")).toBe("3");
    });
    it("shows very small results in exponent form", () => {
      expect(press(engine, "1 / 3 0 0 0 0 0 0 =")).toBe("3.33333333333333e-7");
    });
  });

  describe("numeric precision", () => {
    describe("large integers stay exact up to 2^53", () => {
      it.each([
        ["1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 + 1 =", "123456789012346"],
        ["1 2 3 4 5 6 7 8 9 0 1 2 3 * 1 =", "1234567890123"],
        ["1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 * 1 0 =", "1234567890123450"],
        ["9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 + 1 =", "1000000000000000"],
        ["1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 - 1 2 3 4 5 6 7 8 9 0 1 2 3 4 4 =", "1"],
      ])("%s -> %s", (keys, expected) => {
        expect(press(engine, keys)).toBe(expected);
      });
    });

    describe("results beyond exact range are shown as approximate exponents", () => {
      it.each([
        ["9 9 9 9 9 9 9 9 9 9 * 9 9 9 9 9 9 9 9 9 9 =", "9.999999998e+19"],
        ["9 9 9 9 9 9 9 9 9 9 S * 9 9 9 9 9 9 9 9 9 9 =", "-9.999999998e+19"],
        ["9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 * 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 =", "9.99999999999998e+29"],
        ["1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 * 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 =", "1e+28"],
      ])("%s -> %s", (keys, expected) => {
        expect(press(engine, keys)).toBe(expected);
      });
    });

    describe("entry digit limit", () => {
      it("accepts exactly 15 digits and ignores the rest", () => {
        expect(press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7")).toBe("123456789012345");
      });

      it("counts digits after the decimal point", () => {
        expect(press(engine, "1 . 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6")).toBe("1.23456789012345");
      });

      it("does not count the sign or decimal point as digits", () => {
        press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5");
        expect(press(engine, "S 9")).toBe("-123456789012345");
        expect(press(new CalculatorEngine(), "1 . 2 3 4 5 6 7 8 9 0 1 2 3 4")).toBe("1.2345678901234");
      });

      it("still allows the decimal point at the limit", () => {
        expect(press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 .")).toBe("123456789012345.");
      });

      it("limits each operand separately and does not limit results", () => {
        press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 * 1 0");
        expect(press(engine, "=")).toBe("1234567890123450");
      });

      it("lets a new operand use the full limit again", () => {
        press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 +");
        expect(press(engine, "9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9")).toBe("999999999999999");
      });
    });

    describe("intermediate results keep full precision", () => {
      it.each([
        ["1 / 3 * 3 =", "1"],
        ["2 / 3 * 3 =", "2"],
        ["1 / 3 * 3 * 3 =", "3"],
        ["1 / 3 = * 3 =", "1"],
        ["1 / 3 = S * 3 =", "-1"],
        ["1 / 7 * 7 =", "1"],
        ["0 . 1 + 0 . 2 = * 1 0 =", "3"],
        ["0 . 1 * 3 =", "0.3"],
        ["4 . 3 5 * 1 0 0 =", "435"],
        ["1 . 1 5 * 1 0 0 =", "115"],
      ])("%s -> %s", (keys, expected) => {
        expect(press(engine, keys)).toBe(expected);
      });

      it("keeps precision through percentages", () => {
        expect(press(engine, "2 0 0 / 3 = %")).toBe("0.666666666666667");
        expect(press(engine, "* 3 =")).toBe("2");
      });

      it("chains a running result without rounding it", () => {
        expect(press(engine, "1 / 3 * 3 +")).toBe("1");
        expect(press(engine, "1 =")).toBe("2");
      });
    });

    describe("floating-point cancellation noise", () => {
      it.each([
        ["0 . 1 + 0 . 2 - 0 . 3 =", "0"],
        ["1 . 1 - 1 - 0 . 1 =", "0"],
        ["0 . 3 - 0 . 1 - 0 . 2 =", "0"],
        ["0 . 1 + 0 . 2 =", "0.3"],
      ])("%s -> %s", (keys, expected) => {
        expect(press(engine, keys)).toBe(expected);
      });

      it("does not hide genuinely small values", () => {
        // 0.00000000000001: 13 zeros then a 1 = 15 digits including the leading 0, the smallest possible entry
        const smallest = `0 . ${"0 ".repeat(13)}1`;
        expect(press(engine, `${smallest} + 0 =`)).toBe("1e-14");
      });

      it("does not turn a real tiny difference into 0 (the result is only approximate)", () => {
        // 1 - 0.99999999999999: 0.99999999999999 is not exact in binary, so ~9.99e-15 rather than 1e-14
        const result = Number(press(engine, "1 - 0 . 9 9 9 9 9 9 9 9 9 9 9 9 9 9 ="));
        expect(result).toBeGreaterThan(9.9e-15);
        expect(result).toBeLessThan(1.1e-14);
      });
    });
  });

  describe("state transitions (phase after each key sequence)", () => {
    it("starts entering 0", () => {
      expect(engine.phase).toBe("entering");
      expect(engine.displayValue).toBe("0");
    });

    it.each([
      // [keys, expected phase, expected display]
      ["5", "entering", "5"],
      ["5 +", "awaitingOperand", "5"],
      ["5 + *", "awaitingOperand", "5"],
      ["5 + 3", "entering", "3"],
      ["5 + 3 =", "result", "8"],
      ["5 =", "entering", "5"],
      ["5 + =", "result", "10"],
      ["5 + 3 +", "awaitingOperand", "8"],
      ["5 + 3 = +", "awaitingOperand", "8"],
      ["5 + 3 = 4", "entering", "4"],
      ["5 + 3 = .", "entering", "0."],
      ["5 + .", "entering", "0."],
      ["5 + C", "entering", "0"],
      ["5 + 3 = C", "entering", "0"],
      ["5 0 %", "entering", "0.5"],
      ["5 + %", "awaitingOperand", "5"],
      ["5 + 3 = %", "result", "0.08"],
      ["2 0 0 + 1 0 %", "entering", "20"],
      ["2 0 0 + 1 0 % 5", "entering", "5"],
      ["5 + 3 S", "entering", "-3"],
      ["5 + S", "awaitingOperand", "5"],
      ["5 + 3 = S", "result", "-8"],
      ["0 S", "entering", "0"],
    ])("%s -> %s, shows %s", (keys, phase, display) => {
      press(engine, keys);
      expect(engine.phase).toBe(phase);
      expect(engine.displayValue).toBe(display);
    });

    describe("error phase", () => {
      beforeEach(() => {
        press(engine, "5 / 0 =");
      });

      it("is entered by division by zero", () => {
        expect(engine.phase).toBe("error");
        expect(engine.displayValue).toBe("Error");
      });

      it("is entered when chaining into division by zero", () => {
        const chained = new CalculatorEngine();
        press(chained, "5 / 0 +");
        expect(chained.phase).toBe("error");
      });

      it.each([["+"], ["="], ["S"], ["%"], ["*"]])("ignores %s", (key) => {
        press(engine, key);
        expect(engine.phase).toBe("error");
        expect(engine.displayValue).toBe("Error");
      });

      it("is left by a digit, a decimal point or AC", () => {
        expect(press(new CalculatorEngine(), "5 / 0 = 7")).toBe("7");
        expect(press(new CalculatorEngine(), "5 / 0 = .")).toBe("0.");
        expect(press(new CalculatorEngine(), "5 / 0 = C")).toBe("0");
      });

      it("forgets the pending operation when it is left", () => {
        press(engine, "7");
        expect(engine.phase).toBe("entering");
        expect(press(engine, "=")).toBe("7");
      });
    });

    describe("pending operation across phases", () => {
      it("is kept while the second operand is typed, edited by % or negated", () => {
        expect(press(engine, "2 0 0 + 1 0 %")).toBe("20");
        expect(press(engine, "S")).toBe("-20");
        expect(press(engine, "=")).toBe("180");
      });

      it("is kept when % output is replaced by typing", () => {
        press(engine, "2 0 0 + 1 0 %");
        expect(press(engine, "5 =")).toBe("205");
      });

      it("is dropped by = and by AC", () => {
        press(engine, "2 + 3 =");
        expect(press(engine, "=")).toBe("5");
        press(engine, "2 + C");
        expect(press(engine, "=")).toBe("0");
      });

      it("is dropped when a digit follows a result", () => {
        press(engine, "2 + 3 = 4");
        expect(press(engine, "=")).toBe("4");
      });

      it("is replaced when a second operator follows immediately", () => {
        press(engine, "8 - * 2");
        expect(press(engine, "=")).toBe("16");
      });

      it("uses the displayed number again when = follows an operator", () => {
        expect(press(engine, "7 * =")).toBe("49");
      });
    });

    describe("entry limit by phase", () => {
      it("applies a fresh limit after an operator", () => {
        press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 +");
        expect(engine.phase).toBe("awaitingOperand");
        expect(press(engine, "9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9")).toBe("999999999999999");
      });

      it("applies a fresh limit after a result", () => {
        press(engine, "1 + 1 =");
        expect(press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6")).toBe("123456789012345");
      });

      it("applies a fresh limit after a % result", () => {
        press(engine, "5 0 %");
        expect(press(engine, "1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6")).toBe("123456789012345");
      });
    });
  });
});
