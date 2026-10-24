// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { CalculatorModeSetting } from "../settings/CalculatorModeSetting";
import { ThemeManager } from "../themes/ThemeManager";
import { CalculatorUI } from "../ui/CalculatorUI";
import { CalculatorApp } from "./CalculatorApp";
import { InputHandler } from "./InputHandler";

const OPERATORS: Record<string, string> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };

function loadPage(): void {
  document.body.className = "";
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
  document.body.querySelector("script")?.remove();
}

const typePill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="calculator-mode"]')!;
const lookPill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="appearance"]')!;
const value = (): string => document.querySelector(".display__value")?.textContent ?? "";
const expression = (): string => document.querySelector(".display__expression")?.textContent ?? "";

/** Presses the real buttons: "-" is the existing − key, "S" is +/−, "^" is x², "R" is √. */
function press(keys: string): void {
  for (const key of keys.replace(/\s+/g, "")) {
    const selector =
      /\d/.test(key) ? `[data-number="${key}"]`
      : key === "." ? '[data-action="decimal"]'
      : key === "=" ? '[data-action="equals"]'
      : key === "C" ? '[data-action="clear"]'
      : key === "S" ? '[data-action="toggle-sign"]'
      : key === "%" ? '[data-action="percent"]'
      : key === "(" ? '[data-action="open-parenthesis"]'
      : key === ")" ? '[data-action="close-parenthesis"]'
      : key === "^" ? '[data-action="square"]'
      : key === "R" ? '[data-action="square-root"]'
      : `[data-operator="${OPERATORS[key]}"]`;
    document.querySelector<HTMLButtonElement>(selector)!.click();
  }
}

beforeEach(() => {
  loadPage();
  const root = document.querySelector<HTMLElement>(".app")!;
  new CalculatorApp(new CalculatorEngine(), new CalculatorUI(root), new ThemeManager(document.body), new InputHandler(root), new CalculatorModeSetting()).start();
});

describe.each(["LIGHT", "DARK"])("PRO + %s: unary minus with the existing buttons", (appearance) => {
  beforeEach(() => {
    typePill().click();
    if (appearance === "DARK") lookPill().click();
  });

  it.each([
    ["−(5 + 3) = −8", "-(5+3)=", "−(5 + 3) =", "-8"],
    ["−(2 + 3) × 4 = −20", "-(2+3)*4=", "−(2 + 3) × 4 =", "-20"],
    ["5 × −(2 + 3) = −25", "5*-(2+3)=", "5 × −(2 + 3) =", "-25"],
    ["−(−3 + 1) = 2", "-(-3+1)=", "−(−3 + 1) =", "2"],
    ["(−3)² = 9", "(-3)^=", "(−3)² =", "9"],
    ["−(3²) = −9", "-(3^)=", "−(3²) =", "-9"],
    ["10 − (2 + 3) = 5", "10-(2+3)=", "10 − (2 + 3) =", "5"],
    ["2 × (3 + 4) = 14", "2*(3+4)=", "2 × (3 + 4) =", "14"],
    ["−√9 = −3", "-R9=", "−√9 =", "-3"],
  ])("%s", (_name, keys, expectedExpression, expectedValue) => {
    press(keys);

    expect(expression()).toBe(expectedExpression);
    expect(value()).toBe(expectedValue);
  });

  it("shows −( as soon as ( is pressed after the − key, with no × in between", () => {
    press("-");
    expect(expression()).toBe("−");

    press("(");
    expect(expression()).toBe("−(");

    press("5+3");
    expect(expression()).toBe("−(5 + 3");

    press(")");
    expect(expression()).toBe("−(5 + 3)");
    expect(value()).toBe("-8");
  });

  it("+/− negates a finished group, and pressing it again undoes that", () => {
    press("(5+3)S");
    expect(expression()).toBe("−(5 + 3)");
    expect(value()).toBe("-8");

    press("S");
    expect(expression()).toBe("(5 + 3)");
    expect(value()).toBe("8");
  });

  it("an incomplete expression with a sign is an error with the expression kept, and AC recovers", () => {
    press("-(5+3=");
    expect(value()).toBe("Error");
    expect(expression()).toBe("−(5 + 3");

    press("C");
    expect(expression()).toBe("");
    expect(value()).toBe("0");

    press("-(5+3)=");
    expect(value()).toBe("-8");
  });
});

describe("state and independence", () => {
  it("PRO's −( … expression survives a visit to NORMAL, and the theme toggle", () => {
    typePill().click();
    press("5*-(2+3");

    typePill().click(); // NORMAL has its own state
    press("7");
    expect(expression()).toBe("7");

    lookPill().click();
    typePill().click(); // back to PRO, now dark
    expect(expression()).toBe("5 × −(2 + 3");

    press(")=");
    expect(expression()).toBe("5 × −(2 + 3) =");
    expect(value()).toBe("-25");
  });
});

describe("NORMAL is unchanged: its − key is still only a subtraction", () => {
  it("− first works on the 0 shown, as before", () => {
    press("-5=");

    expect(expression()).toBe("0 − 5 =");
    expect(value()).toBe("-5");
  });

  it("an operator pressed twice: the last one still wins", () => {
    press("5+-3=");

    expect(expression()).toBe("5 − 3 =");
    expect(value()).toBe("2");
  });

  it("2 + 3 × 4 is still 20, and the scientific keys stay hidden", () => {
    press("2+3*4=");

    expect(expression()).toBe("2 + 3 × 4 =");
    expect(value()).toBe("20");
    expect(document.querySelector(".keypad__row[data-pro-only]")!.hasAttribute("hidden")).toBe(true);
  });
});
