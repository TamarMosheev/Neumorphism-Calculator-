import { describe, expect, it } from "vitest";
import {
  appendDecimal,
  appendDigit,
  countDigits,
  MAX_ENTRY_DIGITS,
  negateText,
} from "./NumberEntry";

describe("MAX_ENTRY_DIGITS", () => {
  it("is 15, the most digits a double holds exactly", () => {
    expect(MAX_ENTRY_DIGITS).toBe(15);
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
    ["0.00", 3],
  ])("counts %j as %i (sign and decimal point are not digits)", (text, expected) => {
    expect(countDigits(text)).toBe(expected);
  });
});

describe("appendDigit", () => {
  it.each([
    // [text typed so far, key, text afterwards]
    ["", "5", "5"],
    ["", "0", "0"],
    ["5", "0", "50"],
    ["50", "3", "503"],
    ["-5", "3", "-53"],
    ["0.", "5", "0.5"],
    ["1.5", "0", "1.50"],
  ])("%j + %j -> %j", (text, digit, expected) => {
    expect(appendDigit(text, digit)).toBe(expected);
  });

  describe("leading zeros", () => {
    it("replaces a lone 0 with the next digit", () => {
      expect(appendDigit("0", "7")).toBe("7");
    });

    it("keeps a single 0 when 0 is typed again", () => {
      expect(appendDigit("0", "0")).toBe("0");
    });

    it("keeps zeros after the decimal point", () => {
      expect(appendDigit("0.", "0")).toBe("0.0");
      expect(appendDigit("2.0", "0")).toBe("2.00");
    });
  });

  describe("keys that are not digits are ignored", () => {
    it.each([["a"], [""], ["12"], ["-"], ["."], [" "], ["\n"], ["5\n"], ["٣"], ["+"]])(
      "%j -> null",
      (key) => {
        expect(appendDigit("12", key)).toBeNull();
      },
    );
  });

  describe("15-digit limit", () => {
    it("accepts the 15th digit", () => {
      expect(appendDigit("12345678901234", "5")).toBe("123456789012345");
    });

    it("ignores a 16th digit", () => {
      expect(appendDigit("123456789012345", "6")).toBeNull();
    });

    it("counts digits after the decimal point", () => {
      expect(appendDigit("1.2345678901234", "5")).toBe("1.23456789012345");
      expect(appendDigit("1.23456789012345", "6")).toBeNull();
    });

    it("counts the leading zero of 0.xxx", () => {
      expect(appendDigit("0.12345678901234", "5")).toBeNull();
    });

    it("does not count the sign", () => {
      expect(appendDigit("-12345678901234", "5")).toBe("-123456789012345");
      expect(appendDigit("-123456789012345", "6")).toBeNull();
    });

    it("always lets a new number start", () => {
      expect(appendDigit("", "9")).toBe("9");
    });
  });
});

describe("appendDecimal", () => {
  it.each([
    ["", "0."],
    ["0", "0."],
    ["5", "5."],
    ["-5", "-5."],
    ["-0", "-0."],
    ["12", "12."],
  ])("%j -> %j", (text, expected) => {
    expect(appendDecimal(text)).toBe(expected);
  });

  it.each([["5.7"], ["5."], ["0."], ["-0.5"], ["2.00"]])(
    "ignores a second decimal point in %j",
    (text) => {
      expect(appendDecimal(text)).toBeNull();
    },
  );

  it("is allowed at the digit limit (it adds no digit)", () => {
    expect(appendDecimal("123456789012345")).toBe("123456789012345.");
  });
});

describe("negateText", () => {
  it.each([
    ["5", "-5"],
    ["-5", "5"],
    ["2.00", "-2.00"],
    ["-2.00", "2.00"],
    ["5.", "-5."],
    ["-5.", "5."],
    ["0.5", "-0.5"],
  ])("%j -> %j (formatting is kept)", (text, expected) => {
    expect(negateText(text)).toBe(expected);
  });

  it("is its own inverse", () => {
    for (const text of ["5", "-5", "2.00", "5.", "0.5", "123456789012345", "0"]) {
      expect(negateText(negateText(text))).toBe(text);
    }
  });

  it("does not special-case zero (the caller decides whether to negate zero)", () => {
    expect(negateText("0")).toBe("-0");
    expect(negateText("-0")).toBe("0");
  });
});

/**
 * The rules below are a verbatim copy of what CalculatorEngine did inline before they were extracted.
 * Random key sequences must give identical text with the old and the new code.
 */
describe("equivalence with the original inline rules", () => {
  const LEGACY_MAX = 15;
  const legacyCount = (text: string): number => text.replace(/\D/g, "").length;

  function legacyDigit(text: string, digit: string): string | null {
    if (!/^[0-9]$/.test(digit)) return null;
    if (legacyCount(text) >= LEGACY_MAX) return null;
    return text === "" || text === "0" ? digit : text + digit;
  }

  function legacyDecimal(text: string): string | null {
    if (text === "") return "0.";
    if (!text.includes(".")) return `${text}.`;
    return null;
  }

  const legacyNegate = (text: string): string => (text.startsWith("-") ? text.slice(1) : `-${text}`);

  /** Small deterministic generator (mulberry32) so failures are reproducible. */
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

  const KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "0", ".", ".", "-", "x", ""];

  it("gives the same text after every key of 5000 random sequences", () => {
    const random = seeded(20261022);

    for (let sequence = 0; sequence < 5000; sequence++) {
      let oldText = "";
      let newText = "";

      for (let step = 0; step < 40; step++) {
        const key = KEYS[Math.floor(random() * KEYS.length)]!;

        if (key === ".") {
          oldText = legacyDecimal(oldText) ?? oldText;
          newText = appendDecimal(newText) ?? newText;
        } else if (key === "-") {
          oldText = legacyNegate(oldText);
          newText = negateText(newText);
        } else {
          oldText = legacyDigit(oldText, key) ?? oldText;
          newText = appendDigit(newText, key) ?? newText;
        }

        // Asserted only on a mismatch: 200,000 passing expect() calls cost seconds and add nothing.
        if (newText !== oldText) expect(newText).toBe(oldText);
      }
    }
  });

  it("never lets a typed number exceed the digit limit", () => {
    const random = seeded(42);
    let text = "";

    for (let step = 0; step < 500; step++) {
      text = appendDigit(text, String(Math.floor(random() * 10))) ?? text;
      expect(countDigits(text)).toBeLessThanOrEqual(MAX_ENTRY_DIGITS);
    }
    expect(countDigits(text)).toBe(MAX_ENTRY_DIGITS);
  });
});
