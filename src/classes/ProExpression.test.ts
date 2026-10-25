// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import styles from "../styles/style.css?raw";
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

function startApp(): CalculatorApp {
  const root = document.querySelector<HTMLElement>(".app")!;
  const app = new CalculatorApp(
    new CalculatorEngine(),
    new CalculatorUI(root),
    new ThemeManager(document.body),
    new InputHandler(root),
    new CalculatorModeSetting(),
  );
  app.start();
  return app;
}

const typePill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="calculator-mode"]')!;
const lookPill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="appearance"]')!;
const expressionLine = (): HTMLOutputElement => document.querySelector<HTMLOutputElement>(".display__expression")!;
const value = (): string => document.querySelector(".display__value")?.textContent ?? "";
const expression = (): string => expressionLine().textContent ?? "";

/** Presses the real buttons. "(" ")" "^" (x²) "R" (√) are the PRO row; "C" is AC. */
function press(keys: string): void {
  for (const key of keys.replace(/\s+/g, "")) {
    const selector =
      /\d/.test(key) ? `[data-number="${key}"]`
      : key === "." ? '[data-action="decimal"]'
      : key === "=" ? '[data-action="equals"]'
      : key === "C" ? '[data-action="clear"]'
      : key === "(" ? '[data-action="open-parenthesis"]'
      : key === ")" ? '[data-action="close-parenthesis"]'
      : key === "^" ? '[data-action="square"]'
      : key === "R" ? '[data-action="square-root"]'
      : `[data-operator="${OPERATORS[key]}"]`;
    document.querySelector<HTMLButtonElement>(selector)!.click();
  }
}

/** The expression line after each key press. */
function expressionTrail(keys: string): string[] {
  const shown: string[] = [];
  for (const key of keys.replace(/\s+/g, "")) {
    press(key);
    shown.push(expression());
  }
  return shown;
}

beforeEach(() => {
  loadPage();
});

describe("the expression line in the page", () => {
  it("is inside the display, before the value, and shown for both calculators (not PRO-only)", () => {
    const children = [...document.querySelector(".display")!.children];

    expect(children.map((child) => child.className)).toEqual(["display__expression", "display__value", "display__icon"]);
    expect(expressionLine().hidden).toBe(false);
    expect(expressionLine().hasAttribute("data-pro-only")).toBe(false);
  });

  it("is accessible: it has a name, and does not announce every key press on top of the value", () => {
    expect(expressionLine().getAttribute("aria-label")).toBe("Expression");
    expect(expressionLine().getAttribute("aria-live")).toBe("off");
  });
});

describe("the expression line is there in both calculator types and both appearances", () => {
  it("is shown in NORMAL and in PRO, however the toggles are pressed", () => {
    startApp();
    expect(expressionLine().hidden).toBe(false);

    typePill().click();
    lookPill().click();
    expect(expressionLine().hidden).toBe(false);

    typePill().click();
    lookPill().click();
    expect(expressionLine().hidden).toBe(false);
  });

  it("starts empty in a fresh PRO", () => {
    startApp();
    typePill().click();

    expect(expression()).toBe("");
    expect(value()).toBe("0");
  });
});

describe("the expression line updates while typing, before =", () => {
  beforeEach(() => {
    startApp();
    typePill().click();
  });

  it("( 5 + 3 ) × 2 shows each step, with the parentheses visible", () => {
    expect(expressionTrail("(5+3)*2")).toEqual(["(", "(5", "(5 +", "(5 + 3", "(5 + 3)", "(5 + 3) ×", "(5 + 3) × 2"]);
  });

  it("x² and √ appear in the right place", () => {
    expect(expressionTrail("5^")).toEqual(["5", "5²"]);
    press("C");
    expect(expressionTrail("R81")).toEqual(["√", "√8", "√81"]);
    press("C");
    expect(expressionTrail("81R")).toEqual(["8", "81", "√81"]);
  });

  it("the number being typed is part of the line immediately", () => {
    expect(expressionTrail("12.5")).toEqual(["1", "12", "12.", "12.5"]);
  });
});

describe("after =, the completed expression stays in the small line and the result is the large one", () => {
  beforeEach(() => {
    startApp();
    typePill().click();
  });

  it.each([
    ["A: ( 5 + 3 ) × 2 =", "(5+3)*2=", "(5 + 3) × 2 =", "16"],
    ["B: 5 x² =", "5^=", "5² =", "25"],
    ["C: √ 8 1 =", "R81=", "√81 =", "9"],
    ["D: ( 2 + 3 ) × 4 =", "(2+3)*4=", "(2 + 3) × 4 =", "20"],
    ["2 + 3 × 4 = (PRO precedence)", "2+3*4=", "2 + 3 × 4 =", "14"],
  ])("%s", (_name, keys, expectedExpression, expectedValue) => {
    press(keys);

    expect(expression()).toBe(expectedExpression);
    expect(value()).toBe(expectedValue);
  });

  it("a result carries on into the next expression", () => {
    press("(5+3)*2=");
    press("+4");

    expect(expression()).toBe("16 + 4");
  });
});

describe("AC, invalid expressions and error recovery", () => {
  beforeEach(() => {
    startApp();
    typePill().click();
  });

  it("AC clears both the expression and the result", () => {
    press("(5+3)*2");
    press("C");

    expect(expression()).toBe("");
    expect(value()).toBe("0");

    press("(5+3)*2=C");
    expect(expression()).toBe("");
    expect(value()).toBe("0");
  });

  it.each([
    ["an unclosed group", "(2+3=", "(2 + 3"],
    ["a trailing operator", "2+=", "2 +"],
    ["an empty radicand", "R=", "√"],
    ["division by zero", "5/0=", "5 ÷ 0"],
  ])("%s shows Error and keeps the expression readable, uncorrupted", (_name, keys, expectedExpression) => {
    expect(() => press(keys)).not.toThrow();

    expect(value()).toBe("Error");
    expect(expression()).toBe(expectedExpression);
  });

  it("a stray ) or an x² with nothing to square leaves the line alone", () => {
    press(")");
    expect(expression()).toBe("");
    press("^");
    expect(expression()).toBe("");
  });

  it("recovers after an error: AC clears both lines and the next calculation works", () => {
    press("(2+3=");
    expect(value()).toBe("Error");

    press("C");
    expect(expression()).toBe("");
    expect(value()).toBe("0");

    press("(5+3)*2=");
    expect(expression()).toBe("(5 + 3) × 2 =");
    expect(value()).toBe("16");
  });

  it("a long expression is not truncated in the text: the whole of it is in the line and its tooltip", () => {
    press("1+2+3+4+5+6+7+8+9+1+2+3+4+5+6+7+8+9");

    expect(expression()).toBe("1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9");
    expect(expressionLine().title).toBe(expression());
  });

  it("keeps the newest end of a long expression in view", () => {
    const line = expressionLine();
    Object.defineProperty(line, "scrollWidth", { configurable: true, value: 640 });

    press("1+2");

    expect(line.scrollLeft).toBe(640);
  });
});

describe("state is preserved when switching", () => {
  it("PRO's expression and NORMAL's sum are kept separately across mode switches", () => {
    startApp();
    press("123+4");

    typePill().click();
    press("(5+3");
    expect(expression()).toBe("(5 + 3");

    typePill().click(); // NORMAL: its own sum, with its own expression
    expect(expression()).toBe("123 + 4");
    expect(value()).toBe("127");
    press("=");
    expect(value()).toBe("127");
    expect(expression()).toBe("123 + 4 =");

    typePill().click(); // PRO: the unfinished expression is still there, and still shown
    expect(expression()).toBe("(5 + 3");
    press(")*2=");
    expect(expression()).toBe("(5 + 3) × 2 =");
    expect(value()).toBe("16");
  });

  it("LIGHT/DARK keeps the expression, the result and the calculator type", () => {
    startApp();
    typePill().click();
    press("(5+3)*2");

    lookPill().click();
    expect(expression()).toBe("(5 + 3) × 2");
    expect(expressionLine().hidden).toBe(false);

    press("=");
    lookPill().click();
    expect(expression()).toBe("(5 + 3) × 2 =");
    expect(value()).toBe("16");
    expect(document.body.classList.contains("theme-pro")).toBe(false);
  });

  it.each([
    ["NORMAL", "LIGHT"],
    ["NORMAL", "DARK"],
    ["PRO", "LIGHT"],
    ["PRO", "DARK"],
  ])("%s + %s: the line shows the expression and the calculation works", (mode, appearance) => {
    startApp();
    if (mode === "PRO") typePill().click();
    if (appearance === "DARK") lookPill().click();

    press("2+3*4=");
    expect(value()).toBe(mode === "PRO" ? "14" : "20");
    expect(expressionLine().hidden).toBe(false);
    expect(expression()).toBe("2 + 3 × 4 =");
  });
});

describe("NORMAL stays a standard calculator", () => {
  it("evaluates left to right and shows the expression exactly as entered", () => {
    startApp();

    press("2+3*4=");

    expect(value()).toBe("20");
    expect(expression()).toBe("2 + 3 × 4 =");
  });

  it("has no scientific keys, and its expression never contains parentheses, ² or √", () => {
    startApp();

    expect(document.querySelector(".keypad__row[data-pro-only]")!.hasAttribute("hidden")).toBe(true);
    press("2+3*4");
    expect(expression()).not.toMatch(/[()²√]/);
  });
});

describe("the stylesheet for the expression line", () => {
  const rule = (selector: string): string => {
    const start = styles.indexOf(`${selector} {`);
    return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
  };

  it("uses only existing theme variables: no colour of its own", () => {
    const line = rule(".display__expression");

    expect(line).toContain("color: var(--text-operator)");
    expect(line).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
  });

  it("is muted and small compared with the value", () => {
    const size = (selector: string): number => Number(/font-size:\s*(\d+)px/.exec(rule(selector))![1]);

    expect(size(".display__expression")).toBeLessThan(size(".display__value"));
  });

  it("gives the display exactly the one extra line it needs: 96px instead of 76px, with no :has() special case", () => {
    expect(rule(".display")).toContain("height: 96px");
    expect(styles).not.toContain(":has(");
  });

  it("clips and scrolls long expressions with the scrollbar hidden", () => {
    const line = rule(".display__expression");

    expect(line).toContain("overflow-x: auto");
    expect(line).toContain("white-space: nowrap");
    expect(line).toContain("scrollbar-width: none");
  });
});
