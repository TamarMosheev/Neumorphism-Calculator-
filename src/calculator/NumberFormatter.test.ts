import { describe, expect, it } from "vitest";
import { formatNumber } from "./NumberFormatter";

describe("formatNumber", () => {
  it.each([
    [0, "0"],
    [-0, "0"],
    [5, "5"],
    [-5, "-5"],
    [0.5, "0.5"],
    [-1.25, "-1.25"],
    [123456789012345, "123456789012345"],
    [Number.MAX_SAFE_INTEGER, "9007199254740991"],
    [-Number.MAX_SAFE_INTEGER, "-9007199254740991"],
  ])("shows %s exactly as %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it("removes binary floating-point noise for display only", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(4.35 * 100)).toBe("435");
    expect(formatNumber(1 / 3)).toBe("0.333333333333333");
    expect(formatNumber(2 / 3)).toBe("0.666666666666667");
  });

  it("does not modify the value it is given", () => {
    const value = 0.1 + 0.2;
    formatNumber(value);
    expect(value).toBe(0.30000000000000004);
  });

  it.each([
    [1e16, "1e+16"],
    [99999999980000000000, "9.999999998e+19"],
    [-99999999980000000000, "-9.999999998e+19"],
    [1.5e25, "1.5e+25"],
    [1e300, "1e+300"],
  ])("shows %s beyond the exact range as an approximate exponent %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it("uses exponent notation for tiny values", () => {
    expect(formatNumber(1 / 3000000)).toBe("3.33333333333333e-7");
    expect(formatNumber(1e-7)).toBe("1e-7");
  });
});
