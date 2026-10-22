// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayFitter, fontSizeToFit } from "./DisplayFitter";

describe("fontSizeToFit", () => {
  it("keeps the base size when the text already fits", () => {
    expect(fontSizeToFit(32, 100, 154, 12)).toBe(32);
    expect(fontSizeToFit(32, 154, 154, 12)).toBe(32);
  });

  it("shrinks proportionally when the text is too wide", () => {
    expect(fontSizeToFit(32, 308, 154, 12)).toBe(16);
  });

  it("rounds down so the result never overshoots", () => {
    expect(fontSizeToFit(32, 258, 154, 12)).toBe(19);
  });

  it("never goes below the minimum size", () => {
    expect(fontSizeToFit(32, 3000, 154, 12)).toBe(12);
  });

  it("keeps the base size when there is no measurable width", () => {
    expect(fontSizeToFit(32, 200, 0, 12)).toBe(32);
  });
});

describe("DisplayFitter", () => {
  const BASE_SIZE = 32;
  const AVAILABLE_WIDTH = 154;
  const CHAR_WIDTH_EM = 0.55;

  let element: HTMLElement;

  /** jsdom has no layout, so text width is simulated as chars * font size * 0.55. */
  function simulateLayout(target: HTMLElement): void {
    const textWidth = (): number => {
      const size = parseFloat(target.style.fontSize) || BASE_SIZE;
      return Math.ceil((target.textContent ?? "").length * size * CHAR_WIDTH_EM);
    };
    Object.defineProperty(target, "scrollWidth", { configurable: true, get: () => Math.max(textWidth(), AVAILABLE_WIDTH) });
    Object.defineProperty(target, "clientWidth", { configurable: true, get: () => AVAILABLE_WIDTH });
  }

  const fitsInside = (): boolean => element.scrollWidth <= element.clientWidth;

  beforeEach(() => {
    element = document.createElement("output");
    simulateLayout(element);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ fontSize: `${BASE_SIZE}px` } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves short values at the stylesheet size", () => {
    element.textContent = "0.5";
    new DisplayFitter().fit(element);
    expect(element.style.fontSize).toBe("");
  });

  it("shrinks a 15-digit value just enough to fit", () => {
    element.textContent = "123456789012346";
    new DisplayFitter().fit(element);

    const size = parseFloat(element.style.fontSize);
    expect(size).toBeLessThan(BASE_SIZE);
    expect(size).toBeGreaterThanOrEqual(10);
    expect(fitsInside()).toBe(true);
  });

  it.each([
    "123456789012346",
    "-123456789012345",
    "-1.23456789012345",
    "0.00333333333333333",
    "-3.33333333333333e-7",
    "-9.99999999999998e+29",
    "Error",
    "0",
  ])("fits %s without clipping", (value) => {
    element.textContent = value;
    new DisplayFitter().fit(element);
    expect(fitsInside()).toBe(true);
  });

  it("returns to the full size when a shorter value follows", () => {
    const fitter = new DisplayFitter();
    element.textContent = "123456789012346";
    fitter.fit(element);
    expect(element.style.fontSize).not.toBe("");

    element.textContent = "0";
    fitter.fit(element);
    expect(element.style.fontSize).toBe("");
  });

  it("does not shrink below the configured minimum", () => {
    element.textContent = "9".repeat(80);
    new DisplayFitter(14).fit(element);
    expect(element.style.fontSize).toBe("14px");
  });

  it("refits when the available width changes", () => {
    const fitter = new DisplayFitter();
    element.textContent = "12345678";
    fitter.fit(element);
    const wide = parseFloat(element.style.fontSize || `${BASE_SIZE}`);

    Object.defineProperty(element, "clientWidth", { configurable: true, get: () => 100 });
    fitter.fit(element);
    expect(parseFloat(element.style.fontSize)).toBeLessThan(wide);
  });

  it("does nothing when the font size cannot be read", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ fontSize: "" } as CSSStyleDeclaration);
    element.textContent = "123456789012346";
    expect(() => new DisplayFitter().fit(element)).not.toThrow();
    expect(element.style.fontSize).toBe("");
  });
});
