import { describe, expect, it } from "vitest";
import { calculate, isOperator, OPERATIONS, resolvePercent } from "./Operator";

describe("OPERATIONS", () => {
  it("adds", () => expect(OPERATIONS.add(2, 3)).toBe(5));
  it("subtracts", () => expect(OPERATIONS.subtract(2, 5)).toBe(-3));
  it("multiplies", () => expect(OPERATIONS.multiply(4, 2.5)).toBe(10));
  it("divides", () => expect(OPERATIONS.divide(9, 3)).toBe(3));
  it("divides by zero to Infinity (the engine turns this into Error)", () => {
    expect(OPERATIONS.divide(1, 0)).toBe(Infinity);
  });
});

describe("isOperator", () => {
  it("accepts known operators", () => {
    for (const name of ["add", "subtract", "multiply", "divide"]) {
      expect(isOperator(name)).toBe(true);
    }
  });

  it("rejects unknown, empty and inherited names", () => {
    expect(isOperator(undefined)).toBe(false);
    expect(isOperator("")).toBe(false);
    expect(isOperator("modulo")).toBe(false);
    expect(isOperator("toString")).toBe(false);
  });
});

describe("resolvePercent", () => {
  it("is a plain fraction with no operator", () => {
    expect(resolvePercent(null, null, 50)).toBe(0.5);
  });

  it("is a share of the first operand after + and -", () => {
    expect(resolvePercent("add", 200, 10)).toBe(20);
    expect(resolvePercent("subtract", 200, 10)).toBe(20);
  });

  it("is a plain fraction after x and /", () => {
    expect(resolvePercent("multiply", 200, 10)).toBe(0.1);
    expect(resolvePercent("divide", 200, 10)).toBe(0.1);
  });

  it("supports decimals and negatives", () => {
    expect(resolvePercent("add", 200, 2.5)).toBe(5);
    expect(resolvePercent("add", 200, -10)).toBe(-20);
    expect(resolvePercent(null, null, -50)).toBe(-0.5);
  });
});

describe("calculate", () => {
  it("applies each operator", () => {
    expect(calculate("add", 2, 3)).toBe(5);
    expect(calculate("subtract", 2, 5)).toBe(-3);
    expect(calculate("multiply", 4, 2.5)).toBe(10);
    expect(calculate("divide", 9, 3)).toBe(3);
  });

  it("returns null for division by zero", () => {
    expect(calculate("divide", 1, 0)).toBeNull();
    expect(calculate("divide", 0, 0)).toBeNull();
    expect(calculate("divide", -1, 0)).toBeNull();
  });

  it("returns null on overflow", () => {
    expect(calculate("multiply", 1e308, 10)).toBeNull();
  });
});
