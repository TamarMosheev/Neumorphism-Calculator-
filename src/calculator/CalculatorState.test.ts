import { describe, expect, it } from "vitest";
import {
  type CalculatorState,
  computed,
  countDigits,
  displayTextOf,
  ERROR_STATE,
  ERROR_TEXT,
  INITIAL_STATE,
  negate,
  operandNumber,
  operandText,
  typed,
} from "./CalculatorState";

describe("operands", () => {
  it("keeps typed text exactly as entered", () => {
    expect(operandText(typed("2.00"))).toBe("2.00");
    expect(operandText(typed("5."))).toBe("5.");
    expect(operandNumber(typed("2.00"))).toBe(2);
    expect(operandNumber(typed("5."))).toBe(5);
  });

  it("formats computed values for display but keeps them at full precision", () => {
    const third = computed(1 / 3);
    expect(operandText(third)).toBe("0.333333333333333");
    expect(operandNumber(third)).toBe(1 / 3);
  });

  describe("negate", () => {
    it("flips the sign of typed text and keeps its formatting", () => {
      expect(negate(typed("5"))).toEqual(typed("-5"));
      expect(negate(typed("-5"))).toEqual(typed("5"));
      expect(negate(typed("2.00"))).toEqual(typed("-2.00"));
      expect(negate(typed("5."))).toEqual(typed("-5."));
    });

    it("flips the sign of a computed value without rounding it", () => {
      expect(negate(computed(1 / 3))).toEqual(computed(-1 / 3));
      expect(negate(negate(computed(0.1 + 0.2)))).toEqual(computed(0.1 + 0.2));
    });
  });
});

describe("countDigits", () => {
  it.each([
    ["", 0],
    ["0", 1],
    ["123", 3],
    ["-123", 3],
    ["1.25", 3],
    ["-0.5", 2],
    ["5.", 1],
  ])("counts %j as %i", (text, expected) => {
    expect(countDigits(text)).toBe(expected);
  });
});

describe("displayTextOf", () => {
  it("shows the typed or computed operand while entering", () => {
    expect(displayTextOf({ kind: "entering", operand: typed("12."), pending: null })).toBe("12.");
    expect(displayTextOf({ kind: "entering", operand: computed(0.5), pending: null })).toBe("0.5");
  });

  it("keeps showing the first operand while awaiting the next", () => {
    const state: CalculatorState = {
      kind: "awaitingOperand",
      operand: typed("5."),
      pending: { operator: "add", firstOperand: 5 },
    };
    expect(displayTextOf(state)).toBe("5.");
  });

  it("formats a result", () => {
    expect(displayTextOf({ kind: "result", value: 0.1 + 0.2 })).toBe("0.3");
  });

  it("shows Error in the error state", () => {
    expect(displayTextOf(ERROR_STATE)).toBe(ERROR_TEXT);
  });

  it("starts at 0, entering, with nothing pending", () => {
    expect(INITIAL_STATE).toEqual({ kind: "entering", operand: typed("0"), pending: null });
    expect(displayTextOf(INITIAL_STATE)).toBe("0");
  });

  it("fails loudly on an unknown state instead of showing wrong text", () => {
    expect(() => displayTextOf({ kind: "bogus" } as never)).toThrow(/Unhandled calculator state/);
  });
});
