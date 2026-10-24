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
const PRO_KEYS = ["open-parenthesis", "close-parenthesis", "square", "square-root"] as const;

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
const proRow = (): HTMLElement => document.querySelector<HTMLElement>(".keypad__row[data-pro-only]")!;
const proKey = (action: (typeof PRO_KEYS)[number]): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
const displayText = (): string => document.querySelector(".display__value")?.textContent ?? "";

/** Presses the real buttons: digits and operators as characters, "(" ")" "^" (square) "R" (root) for the PRO row. */
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

beforeEach(() => {
  loadPage();
});

describe("the PRO-only row in the page", () => {
  it("is the first row of the keypad, above AC / +/- / % / ÷", () => {
    const rows = [...document.querySelectorAll(".keypad > .keypad__row")];

    expect(rows[0]).toBe(proRow());
    expect(rows[1]!.querySelector('[data-action="clear"]')).not.toBeNull();
  });

  it("holds exactly ( ) x² √, in that order, reusing the existing function-key style", () => {
    const keys = [...proRow().querySelectorAll("button")];

    expect(keys.map((key) => key.textContent)).toEqual(["(", ")", "x²", "√"]);
    expect(keys.map((key) => key.getAttribute("data-action"))).toEqual([...PRO_KEYS]);
    for (const key of keys) {
      expect(key.className).toBe("btn btn--function");
      expect(key.getAttribute("type")).toBe("button");
      expect(key.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("starts hidden, so the page loads as NORMAL without a flash of PRO keys", () => {
    expect(proRow().hidden).toBe(true);
  });
});

describe("the PRO-only row follows the calculator type, and only that", () => {
  it("is hidden in NORMAL, shown in PRO, hidden again back in NORMAL", () => {
    startApp();
    expect(proRow().hidden).toBe(true);

    typePill().click();
    expect(proRow().hidden).toBe(false);

    typePill().click();
    expect(proRow().hidden).toBe(true);
  });

  it("is not changed by the appearance toggle, in either mode", () => {
    startApp();

    lookPill().click();
    expect(proRow().hidden).toBe(true);
    typePill().click();
    expect(proRow().hidden).toBe(false);
    lookPill().click();
    expect(proRow().hidden).toBe(false);
    typePill().click();
    expect(proRow().hidden).toBe(true);
  });

  it("is hidden with the hidden attribute, which the stylesheet really honours", () => {
    // .keypad__row is display: contents, which would otherwise override [hidden]
    expect(styles).toMatch(/\.keypad__row\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });

  it("adds no colour, shadow or size of its own: the stylesheet only gained the hide rule", () => {
    expect(styles).not.toMatch(/data-pro-only|open-parenthesis|square-root/);
  });
});

describe("the PRO-only keys calculate with the existing ProCalculator", () => {
  it.each(["light", "dark"])("(2 + 3) × 4 = 20, 5 x² = 25, √ 81 = 9 in PRO + %s", (appearance) => {
    startApp();
    typePill().click();
    if (appearance === "dark") lookPill().click();

    press("(2+3)*4=");
    expect(displayText()).toBe("20");

    press("C5^=");
    expect(displayText()).toBe("25");

    press("CR81=");
    expect(displayText()).toBe("9");

    press("C81R=");
    expect(displayText()).toBe("9");
  });

  it("uses precedence and nesting correctly: 2 × (3 + 4) = 14, (2 + 3)² = 25", () => {
    startApp();
    typePill().click();

    press("2*(3+4)=");
    expect(displayText()).toBe("14");

    press("C(2+3)^=");
    expect(displayText()).toBe("25");
  });

  it("ignores keys that cannot apply, as ProCalculator does (a lone ')' does nothing)", () => {
    startApp();
    typePill().click();

    press(")");
    expect(displayText()).toBe("0");
  });
});

describe("the PRO-only keys are inactive in NORMAL", () => {
  it("do nothing if clicked anyway, and never touch either calculator", () => {
    startApp();
    press("5");
    for (const action of PRO_KEYS) proKey(action).click();
    expect(displayText()).toBe("5");

    press("+3=");
    expect(displayText()).toBe("8");

    // PRO's calculator was never touched by those clicks
    typePill().click();
    expect(displayText()).toBe("0");
  });

  it("sit in a hidden container, so they are out of reach for keyboard and screen readers", () => {
    startApp();

    for (const action of PRO_KEYS) expect(proKey(action).closest("[hidden]")).toBe(proRow());
  });

  it("NORMAL still calculates left to right exactly as before", () => {
    startApp();

    press("2+3*4=");
    expect(displayText()).toBe("20");
  });
});

describe("switching modes preserves state with the PRO-only keys in play", () => {
  it("keeps a half-built PRO expression and a half-typed NORMAL sum, separately", () => {
    startApp();
    press("123+4");
    expect(displayText()).toBe("4");

    typePill().click();
    press("(2+3");
    expect(displayText()).toBe("3");

    typePill().click(); // back to NORMAL: untouched
    expect(displayText()).toBe("4");
    press("=");
    expect(displayText()).toBe("127");

    typePill().click(); // PRO: the open group is still there
    expect(displayText()).toBe("3");
    press(")*4=");
    expect(displayText()).toBe("20");
  });
});

/** Presses the keys one at a time and returns the display after each press (the click path a user sees). */
function trail(keys: string): string[] {
  const shown: string[] = [];
  for (const key of keys.replace(/\s+/g, "")) {
    press(key);
    shown.push(displayText());
  }
  return shown;
}

describe("the click path, key by key: button -> InputHandler -> CalculatorApp -> ProCalculator -> display", () => {
  beforeEach(() => {
    startApp();
    typePill().click();
  });

  it("5 x² = shows 5, 25 (the square is applied at once), then 25", () => {
    expect(trail("5^=")).toEqual(["5", "25", "25"]);
  });

  it("√ 8 1 = shows 0, 8, 81, then 9", () => {
    expect(trail("R81=")).toEqual(["0", "8", "81", "9"]);
  });

  it("( 2 + 3 ) × 4 = shows 0, 2, 2, 3, 5, 5, 4, then 20", () => {
    expect(trail("(2+3)*4=")).toEqual(["0", "2", "2", "3", "5", "5", "4", "20"]);
  });

  it.each(PRO_KEYS)("%s is bound to a real handler: pressing it changes what the next presses calculate", (action) => {
    // each key alone changes the outcome of "9 =" compared with not pressing it
    const outcome = (before: string): string => {
      press("C");
      press(before);
      return trail("9=").at(-1)!;
    };
    const symbol = { "open-parenthesis": "(", "close-parenthesis": ")", square: "^", "square-root": "R" }[action];

    // "(" before 9 leaves a group open, so "=" is an error; ")" with nothing open is ignored;
    // "x²" with nothing to square is ignored; "√" before 9 takes the root: 3
    const expected = { "open-parenthesis": "Error", "close-parenthesis": "9", square: "9", "square-root": "3" }[action];
    expect(outcome(symbol)).toBe(expected);
    expect(proKey(action).getAttribute("data-action")).toBe(action);
  });
});

describe("invalid and incomplete expressions are handled safely", () => {
  beforeEach(() => {
    startApp();
    typePill().click();
  });

  it.each([
    ["an unclosed group: ( 2 + 3 =", "(2+3=", "Error"],
    ["a trailing operator: 2 + =", "2+=", "Error"],
    ["an empty radicand: √ =", "R=", "Error"],
    ["division by zero: 5 ÷ 0 =", "5/0=", "Error"],
    ["a stray close: ) 5 =", ")5=", "5"],
    ["squaring nothing: x² =", "^=", "0"],
  ])("%s", (_name, keys, expected) => {
    expect(() => press(keys)).not.toThrow();
    expect(displayText()).toBe(expected);
  });

  it("recovers with AC after an error, and the calculator works again", () => {
    press("(2+3=");
    expect(displayText()).toBe("Error");

    press("C");
    expect(displayText()).toBe("0");
    press("(2+3)*4=");
    expect(displayText()).toBe("20");
  });

  it("a very deep pile of ( stops growing instead of failing, and AC still recovers", () => {
    expect(() => press("(".repeat(60))).not.toThrow();

    press("C5^=");
    expect(displayText()).toBe("25");
  });

  it("keeps working in dark: the keys do not depend on the appearance", () => {
    lookPill().click();

    expect(trail("5^=")).toEqual(["5", "25", "25"]);
    press("C");
    expect(trail("(2+3)*4=").at(-1)).toBe("20");
  });
});

describe("the display now shows what ( and √ did (the old one-number limitation is gone)", () => {
  beforeEach(() => {
    startApp();
    typePill().click();
  });

  it("an opening ( or a pending √ is visible in the expression line, though the value stays 0", () => {
    press("(");
    expect(displayText()).toBe("0");
    expect(document.querySelector(".display__expression")!.textContent).toBe("(");

    press("C");
    press("R");
    expect(document.querySelector(".display__expression")!.textContent).toBe("√");
  });
});

describe("the PRO-only keys' listeners", () => {
  it("fire once per click", () => {
    startApp();
    typePill().click();

    press("(("); // each "(" adds one level; a doubled listener would add two
    press("1))=");
    expect(displayText()).toBe("1");
  });
});
