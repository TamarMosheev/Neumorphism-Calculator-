// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { ThemeManager } from "../themes/ThemeManager";
import { CalculatorUI } from "../ui/CalculatorUI";
import { DisplayFitter } from "../ui/DisplayFitter";
import { CalculatorApp } from "./CalculatorApp";
import { InputHandler } from "./InputHandler";
import indexHtml from "../../index.html?raw";

const OPERATOR_NAMES: Record<string, string> = {
  "+": "add",
  "-": "subtract",
  "×": "multiply",
  "÷": "divide",
};

function appRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>(".app");
  if (!root) throw new Error("No .app root in the page");
  return root;
}

function loadPage(): void {
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
  document.body.querySelector("script")?.remove();
}

/**
 * Clicks real buttons from index.html like a user (e.g. "AC 2 0 0 × 1 0 % =")
 * and returns the display text after every click.
 */
function clickKeys(keys: string): string[] {
  const trace: string[] = [];
  for (const key of keys.split(" ")) {
    const selector =
      key === "AC" ? '[data-action="clear"]'
      : key === "=" ? '[data-action="equals"]'
      : key === "%" ? '[data-action="percent"]'
      : key === "." ? '[data-action="decimal"]'
      : key in OPERATOR_NAMES ? `[data-operator="${OPERATOR_NAMES[key]}"]`
      : `[data-number="${key}"]`;
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`No button for "${key}"`);
    button.click();
    trace.push(display());
  }
  return trace;
}

const display = (): string => document.querySelector(".display__value")?.textContent ?? "";

describe("percentage through the real page (HTML -> InputHandler -> Engine -> UI)", () => {
  beforeEach(() => {
    loadPage();
    new CalculatorApp(
      new CalculatorEngine(),
      new CalculatorUI(appRoot()),
      new ThemeManager(),
      new InputHandler(appRoot()),
    ).start();
  });

  it.each([
    ["5 0 %", "0.5"],
    ["2 0 0 × 1 0 % =", "20"],
    ["2 0 0 + 1 0 % =", "220"],
    ["2 0 0 - 1 0 % =", "180"],
    ["2 0 0 ÷ 1 0 % =", "2000"],
  ])("%s -> %s", (keys, expected) => {
    clickKeys(keys);
    expect(display()).toBe(expected);
  });

  it("still does plain arithmetic and decimals", () => {
    clickKeys("1 . 5 + 2 . 2 5 =");
    expect(display()).toBe("3.75");
  });

  it.each([
    ["AC 5 0 %", "0.5"],
    ["AC 2 5 %", "0.25"],
  ])("%s -> %s (reported browser bug)", (keys, expected) => {
    clickKeys(keys);
    expect(display()).toBe(expected);
  });

  describe("step-by-step display trace (operand and operator after every click)", () => {
    it("A + B%: % converts B to a share of A, = completes the addition", () => {
      expect(clickKeys("AC 2 0 0 + 1 0 % =")).toEqual(
        ["0", "2", "20", "200", "200", "1", "10", "20", "220"],
      );
    });

    it("A - B%: % converts B to a share of A, = completes the subtraction", () => {
      expect(clickKeys("AC 2 0 0 - 1 0 % =")).toEqual(
        ["0", "2", "20", "200", "200", "1", "10", "20", "180"],
      );
    });

    it("A × B%: % converts B to a plain fraction", () => {
      expect(clickKeys("AC 2 0 0 × 1 0 % =")).toEqual(
        ["0", "2", "20", "200", "200", "1", "10", "0.1", "20"],
      );
    });

    it("A ÷ B%: % converts B to a plain fraction", () => {
      expect(clickKeys("AC 2 0 0 ÷ 1 0 % =")).toEqual(
        ["0", "2", "20", "200", "200", "1", "10", "0.1", "2000"],
      );
    });

    it("standalone B% is B / 100", () => {
      expect(clickKeys("AC 5 0 %")).toEqual(["0", "5", "50", "0.5"]);
    });

    it("pressing = BEFORE % applies % to the finished result (210 -> 2.1)", () => {
      expect(clickKeys("AC 2 0 0 + 1 0 = %")).toEqual(
        ["0", "2", "20", "200", "200", "1", "10", "210", "2.1"],
      );
    });
  });

  describe("appearance toggle through the real page", () => {
    const toggle = (): HTMLButtonElement => document.querySelector('[data-setting="appearance"]')!;
    const label = (): string => document.querySelector('[data-setting="appearance"] .mode-toggle__label')?.textContent ?? "";

    it("starts in the LIGHT appearance", () => {
      expect(label()).toBe("LIGHT MODE");
      expect(document.body.classList.contains("theme-pro")).toBe(false);
    });

    it("switches to the DARK appearance and back", () => {
      toggle().click();
      expect(label()).toBe("DARK MODE");
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      expect(document.body.classList.contains("theme-pro")).toBe(true);

      toggle().click();
      expect(label()).toBe("LIGHT MODE");
      expect(toggle().getAttribute("aria-checked")).toBe("false");
      expect(document.body.classList.contains("theme-pro")).toBe(false);
    });

    it("does not change the display or calculation state", () => {
      clickKeys("AC 5 0");
      toggle().click();
      expect(display()).toBe("50");
      expect(clickKeys("%")).toEqual(["0.5"]);
      toggle().click();
      expect(display()).toBe("0.5");
    });
  });
});

/** Builds an app on the page's calculator root, with an isolated ThemeManager. */
function createApp(options: { root?: HTMLElement; fitter?: DisplayFitter } = {}) {
  const root = options.root ?? appRoot();
  const engine = new CalculatorEngine();
  const ui = new CalculatorUI(root, options.fitter);
  const themeManager = new ThemeManager(document.createElement("div"));
  const inputHandler = new InputHandler(root);
  const app = new CalculatorApp(engine, ui, themeManager, inputHandler);
  return { app, engine, ui, themeManager, root };
}

const clickIn = (root: ParentNode, selector: string): void => {
  root.querySelector<HTMLElement>(selector)!.click();
};

describe("listener lifecycle", () => {
  beforeEach(() => {
    loadPage();
  });

  it("handles one click once", () => {
    const { app, engine } = createApp();
    app.start();

    clickIn(document, '[data-number="5"]');

    expect(engine.displayValue).toBe("5");
    expect(display()).toBe("5");
  });

  it("does not duplicate listeners when start() is called twice", () => {
    const { app, engine, themeManager } = createApp();
    app.start();
    app.start();

    clickIn(document, '[data-number="5"]');
    clickIn(document, '[data-setting="appearance"]');

    expect(engine.displayValue).toBe("5");
    expect(themeManager.appearance).toBe("dark");
  });

  it("stops reacting to clicks after dispose()", () => {
    const { app, engine, themeManager } = createApp();
    app.start();
    app.dispose();

    clickIn(document, '[data-number="5"]');
    clickIn(document, '[data-setting="appearance"]');

    expect(engine.displayValue).toBe("0");
    expect(display()).toBe("0");
    expect(themeManager.appearance).toBe("light");
  });

  it("is safe to dispose twice, or before start()", () => {
    const { app } = createApp();
    expect(() => {
      app.dispose();
      app.dispose();
    }).not.toThrow();
  });

  it("does nothing if start() is called after dispose()", () => {
    const { app, engine } = createApp();
    app.dispose();
    app.start();

    clickIn(document, '[data-number="5"]');

    expect(engine.displayValue).toBe("0");
  });

  it("lets a new app take over the same DOM once the old one is disposed (hot reload)", () => {
    const first = createApp();
    first.app.start();
    first.app.dispose();

    const second = createApp();
    second.app.start();
    clickIn(document, '[data-number="5"]');

    expect(second.engine.displayValue).toBe("5");
    expect(first.engine.displayValue).toBe("0");
    expect(display()).toBe("5");
  });

  it("keeps apps on separate roots independent", () => {
    const secondRoot = document.createElement("div");
    secondRoot.innerHTML = appRoot().outerHTML;
    document.body.append(secondRoot);
    const secondAppRoot = secondRoot.querySelector<HTMLElement>(".app")!;

    const first = createApp();
    const second = createApp({ root: secondAppRoot });
    first.app.start();
    second.app.start();

    clickIn(first.root, '[data-number="5"]');

    expect(first.engine.displayValue).toBe("5");
    expect(second.engine.displayValue).toBe("0");
    expect(secondAppRoot.querySelector(".display__value")?.textContent).toBe("0");
  });

  describe("window resize listener", () => {
    let fitter: DisplayFitter;
    let fit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fitter = new DisplayFitter();
      fit = vi.spyOn(fitter, "fit").mockImplementation(() => undefined);
    });

    it("refits once per resize, even if start() ran twice", () => {
      const { app } = createApp({ fitter });
      app.start();
      app.start();
      fit.mockClear();

      window.dispatchEvent(new Event("resize"));

      expect(fit).toHaveBeenCalledTimes(1);
    });

    it("stops refitting after dispose()", () => {
      const { app } = createApp({ fitter });
      app.start();
      app.dispose();
      fit.mockClear();

      window.dispatchEvent(new Event("resize"));

      expect(fit).not.toHaveBeenCalled();
    });
  });
});
