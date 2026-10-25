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

function startApp(): { engine: CalculatorEngine } {
  const root = document.querySelector<HTMLElement>(".app")!;
  const engine = new CalculatorEngine();
  new CalculatorApp(engine, new CalculatorUI(root), new ThemeManager(document.body), new InputHandler(root), new CalculatorModeSetting()).start();
  return { engine };
}

const typePill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="calculator-mode"]')!;
const lookPill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="appearance"]')!;
const value = (): string => document.querySelector(".display__value")?.textContent ?? "";
const expression = (): string => document.querySelector(".display__expression")?.textContent ?? "";

/** Presses the real buttons. "S" is +/−, "%" percent, "C" AC; "(" ")" "^" (x²) "R" (√) exist only in PRO. */
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
  startApp();
});

describe("NORMAL shows the expression above the value", () => {
  it("starts with an empty line and 0", () => {
    expect(expression()).toBe("");
    expect(value()).toBe("0");
  });

  it("2 + 3 × 4 = shows 2 + 3 × 4 = and 20 (left to right)", () => {
    press("2+3*4=");

    expect(expression()).toBe("2 + 3 × 4 =");
    expect(value()).toBe("20");
  });

  it("200 + 10 % = shows the percentage as pressed, and 220", () => {
    press("200+10%");
    expect(expression()).toBe("200 + 10%");
    expect(value()).toBe("220");

    press("=");
    expect(expression()).toBe("200 + 10% =");
    expect(value()).toBe("220");
  });

  it("8 ÷ 2 = shows 8 ÷ 2 = and 4", () => {
    press("8/2=");

    expect(expression()).toBe("8 ÷ 2 =");
    expect(value()).toBe("4");
  });

  it("updates on every key, before = is pressed", () => {
    expect(expressionTrail("2+3*4")).toEqual(["2", "2 +", "2 + 3", "2 + 3 ×", "2 + 3 × 4"]);
  });

  it("keeps trailing decimal zeros while typing", () => {
    expect(expressionTrail("1.50")).toEqual(["1", "1.", "1.5", "1.50"]);
    expect(value()).toBe("1.50");
  });
});

describe("AC, continuation and new entries", () => {
  it("AC clears the expression and shows 0", () => {
    press("2+3*4=");
    press("C");

    expect(expression()).toBe("");
    expect(value()).toBe("0");
  });

  it("a result carries on into the next expression, and a digit starts a new one", () => {
    press("2+3=");
    press("*");
    expect(expression()).toBe("5 ×");

    press("4=");
    expect(expression()).toBe("5 × 4 =");
    expect(value()).toBe("20");

    press("9");
    expect(expression()).toBe("9");
  });
});

describe("errors and recovery", () => {
  it("5 ÷ 0 = shows Error and keeps the expression readable", () => {
    press("5/0=");

    expect(value()).toBe("Error");
    expect(expression()).toBe("5 ÷ 0 =");
  });

  it("a digit starts over, and AC clears", () => {
    press("5/0=");
    press("3+4=");
    expect(expression()).toBe("3 + 4 =");
    expect(value()).toBe("7");

    press("5/0=C");
    expect(expression()).toBe("");
    expect(value()).toBe("0");
  });
});

describe("NORMAL stays a standard calculator", () => {
  it("its scientific keys stay hidden and inactive, and its expression never shows ( ) ² √", () => {
    const row = document.querySelector(".keypad__row[data-pro-only]")!;
    expect(row.hasAttribute("hidden")).toBe(true);

    press("2+3");
    press("()^R"); // clicks on the hidden keys must do nothing
    expect(expression()).toBe("2 + 3");
    expect(value()).toBe("5");
  });

  it("still has exactly the original 19 visible keys", () => {
    const keys = [...document.querySelectorAll(".keypad button")].filter((button) => !button.closest("[hidden]"));

    expect(keys.map((button) => button.textContent!.trim())).toEqual(["AC", "+/-", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="]);
  });
});

describe("switching between NORMAL and PRO keeps each expression", () => {
  it("NORMAL's expression survives a visit to PRO, and PRO's survives a return to NORMAL", () => {
    press("2+3*4");
    expect(expression()).toBe("2 + 3 × 4");

    typePill().click(); // PRO: its own, empty expression
    expect(expression()).toBe("");
    press("(5+3");
    expect(expression()).toBe("(5 + 3");

    typePill().click(); // NORMAL again
    expect(expression()).toBe("2 + 3 × 4");
    expect(value()).toBe("20");
    press("=");
    expect(expression()).toBe("2 + 3 × 4 =");
    expect(value()).toBe("20");

    typePill().click(); // PRO again
    expect(expression()).toBe("(5 + 3");
    press(")*2=");
    expect(expression()).toBe("(5 + 3) × 2 =");
    expect(value()).toBe("16");

    typePill().click();
    expect(expression()).toBe("2 + 3 × 4 =");
    expect(value()).toBe("20");
  });

  it("the same keys give NORMAL's left-to-right answer and PRO's precedence answer, each with its own line", () => {
    press("2+3*4=");
    expect([expression(), value()]).toEqual(["2 + 3 × 4 =", "20"]);

    typePill().click();
    press("2+3*4=");
    expect([expression(), value()]).toEqual(["2 + 3 × 4 =", "14"]);
  });
});

describe("LIGHT/DARK never changes the expression or the calculation", () => {
  it("keeps the NORMAL expression and result across appearance switches, mid-typing and after =", () => {
    press("200+10%");

    lookPill().click();
    expect(expression()).toBe("200 + 10%");
    expect(value()).toBe("220");

    press("=");
    lookPill().click();
    expect(expression()).toBe("200 + 10% =");
    expect(value()).toBe("220");
    expect(document.body.classList.contains("theme-pro")).toBe(false);
    expect(typePill().querySelector(".mode-toggle__label")!.textContent).toBe("NORMAL MODE");
  });

  it.each([
    ["NORMAL", "LIGHT"],
    ["NORMAL", "DARK"],
    ["PRO", "LIGHT"],
    ["PRO", "DARK"],
  ])("%s + %s works", (mode, appearance) => {
    if (mode === "PRO") typePill().click();
    if (appearance === "DARK") lookPill().click();

    press("2+3*4=");

    expect(expression()).toBe("2 + 3 × 4 =");
    expect(value()).toBe(mode === "PRO" ? "14" : "20");
  });
});

describe("the stylesheet for the shared expression line", () => {
  const rule = (selector: string): string => {
    const start = styles.indexOf(`${selector} {`);
    return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
  };

  it("reuses the PRO expression rule and the existing variables, with no colour of its own", () => {
    const line = rule(".display__expression");

    expect(line).toContain("color: var(--text-operator)");
    expect(line).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
    expect(styles.match(/\.display__expression\s*\{/g)).toHaveLength(1);
  });

  it("makes the display 96px tall, with nothing else about the display changed", () => {
    const display = rule(".display");

    expect(display).toContain("height: 96px");
    expect(display).toContain("width: 224px");
    expect(display).toContain("border-radius: 22px");
    expect(display).toContain("background: linear-gradient(145deg, var(--disp-a), var(--disp-b))");
  });

  it("does not touch the keypad: still four 48px columns with a 16px row gap", () => {
    const keypad = rule(".keypad");

    expect(keypad).toContain("grid-template-columns: repeat(4, 48px)");
    expect(keypad).toContain("row-gap: 16px");
  });
});
