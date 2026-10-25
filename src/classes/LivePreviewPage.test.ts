// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { ThemeManager } from "../themes/ThemeManager";
import { CalculatorUI } from "../ui/CalculatorUI";
import { CalculatorApp } from "./CalculatorApp";
import { InputHandler } from "./InputHandler";
import indexHtml from "../../index.html?raw";

const app = (): HTMLElement => document.querySelector<HTMLElement>(".app")!;
const click = (selector: string): void => document.querySelector<HTMLElement>(selector)!.click();
const display = (): string => document.querySelector(".display__value")?.textContent ?? "";
const expression = (): string => document.querySelector(".display__expression")?.textContent ?? "";
const modeLabel = (): string => document.querySelector('[data-setting="calculator-mode"] .mode-toggle__label')?.textContent ?? "";

/** What a page load does: fresh markup and a fresh app, exactly as main.ts builds it. */
function loadPage(): CalculatorApp {
  document.body.className = "";
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
  document.body.querySelector("script")?.remove();

  const instance = new CalculatorApp(new CalculatorEngine(), new CalculatorUI(app()), new ThemeManager(), new InputHandler(app()));
  instance.start();
  return instance;
}

/** 2 + 3 × 4: NORMAL works left to right (20), PRO applies precedence (14). */
const press2Plus3Times4 = (): void => {
  for (const selector of ['[data-number="2"]', '[data-operator="add"]', '[data-number="3"]', '[data-operator="multiply"]', '[data-number="4"]']) {
    click(selector);
  }
};

describe("2 + 3 × 4 on the real page previews with the rules of the calculator type that is switched on", () => {
  let running: CalculatorApp;

  beforeEach(() => {
    running?.dispose();
    running = loadPage();
  });

  it.each(["light", "dark"])("PRO + %s: the large display shows 14 before = is pressed", (appearance) => {
    click('[data-setting="calculator-mode"]');
    if (appearance === "dark") click('[data-setting="appearance"]');

    press2Plus3Times4();

    expect(modeLabel()).toBe("PRO MODE");
    expect(expression()).toBe("2 + 3 × 4");
    expect(display()).toBe("14");
  });

  it.each(["light", "dark"])("NORMAL + %s: the large display shows 20 before = is pressed", (appearance) => {
    if (appearance === "dark") click('[data-setting="appearance"]');

    press2Plus3Times4();

    expect(modeLabel()).toBe("NORMAL MODE");
    expect(expression()).toBe("2 + 3 × 4");
    expect(display()).toBe("20");
  });

  it("a page load always starts in NORMAL, even after PRO was on (the setting is not stored)", () => {
    click('[data-setting="calculator-mode"]');
    expect(modeLabel()).toBe("PRO MODE");

    running.dispose();
    running = loadPage();

    expect(modeLabel()).toBe("NORMAL MODE");
    press2Plus3Times4();
    expect(display()).toBe("20");
  });
});
