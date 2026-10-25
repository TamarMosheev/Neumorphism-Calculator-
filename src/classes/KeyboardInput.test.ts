// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { ThemeManager } from "../themes/ThemeManager";
import { CalculatorUI } from "../ui/CalculatorUI";
import { CalculatorApp } from "./CalculatorApp";
import { InputHandler } from "./InputHandler";
import indexHtml from "../../index.html?raw";

type Mode = "normal" | "pro";

const root = (): HTMLElement => document.querySelector<HTMLElement>(".app")!;
const display = (): string => document.querySelector(".display__value")?.textContent ?? "";
const expression = (): string => document.querySelector(".display__expression")?.textContent ?? "";
const click = (selector: string): void => document.querySelector<HTMLElement>(selector)!.click();

function pressOne(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Presses each character as its own key; Enter is written as `>` and Escape as `!`. */
function type(keys: string): void {
  for (const key of keys) pressOne(key === ">" ? "Enter" : key === "!" ? "Escape" : key);
}

function createApp(): CalculatorApp {
  return new CalculatorApp(
    new CalculatorEngine(),
    new CalculatorUI(root()),
    new ThemeManager(document.createElement("div")),
    new InputHandler(root()),
  );
}

function setMode(mode: Mode): void {
  const isPro = document.querySelector('[data-setting="calculator-mode"]')!.getAttribute("aria-checked") === "true";
  if (isPro !== (mode === "pro")) click('[data-setting="calculator-mode"]');
}

describe("physical keyboard through the real page", () => {
  let app: CalculatorApp;

  beforeEach(() => {
    document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
    document.body.querySelector("script")?.remove();
    app = createApp();
    app.start();
    return () => app.dispose();
  });

  describe.each<Mode>(["normal", "pro"])("%s calculator", (mode) => {
    beforeEach(() => setMode(mode));

    it.each([
      ["1.5+2.25>", "3.75"],
      ["8-3>", "5"],
      ["6/4>", "1.5"],
      ["7*6>", "42"],
      ["200+10%>", "220"],
      ["200*10%>", "20"],
      ["50%", "0.5"],
    ])("%s -> %s", (keys, expected) => {
      type(keys);
      expect(display()).toBe(expected);
    });

    it("= works like Enter", () => {
      type("2+3=");
      expect(display()).toBe("5");
    });

    it("Escape clears everything", () => {
      type("2+3>");
      type("!");
      expect(display()).toBe("0");
      expect(expression()).toBe("");
    });

    it("shows an error for division by zero, and Escape recovers", () => {
      type("1/0>");
      expect(display()).toBe("Error");
      type("!5");
      expect(display()).toBe("5");
    });

    it("mixes with clicks on the on-screen buttons", () => {
      click('[data-number="2"]');
      pressOne("+");
      click('[data-number="3"]');
      pressOne("Enter");
      expect(display()).toBe("5");
    });
  });

  describe("operator precedence", () => {
    it("NORMAL evaluates 2+3*4 left to right", () => {
      setMode("normal");
      type("2+3*4>");
      expect(display()).toBe("20");
    });

    it("PRO evaluates 2+3*4 with precedence", () => {
      setMode("pro");
      type("2+3*4>");
      expect(display()).toBe("14");
      expect(expression()).toBe("2 + 3 × 4 =");
    });
  });

  describe("PRO parentheses and unary minus", () => {
    beforeEach(() => setMode("pro"));

    it.each([
      ["(2+3)*4>", "20"],
      ["((2+3)*(4-1))>", "15"],
      ["-(2+3)>", "-5"],
      ["5*-(2+3)>", "-25"],
      ["2*(3+4)-1>", "13"],
    ])("%s -> %s", (keys, expected) => {
      type(keys);
      expect(display()).toBe(expected);
    });

    it("shows the expression as it is typed", () => {
      type("(2+3)*4");
      expect(expression()).toBe("(2 + 3) × 4");
    });

    it("an unclosed group is an error on Enter", () => {
      type("(2+3>");
      expect(display()).toBe("Error");
    });

    it("a stray ) is ignored", () => {
      type("2)>");
      expect(display()).toBe("2");
    });
  });

  describe("NORMAL has no parentheses", () => {
    it("( and ) change nothing: the digits simply follow each other", () => {
      setMode("normal");
      type("2(3)+1>");
      expect(display()).toBe("24");
    });
  });

  describe("keys that are not calculator input", () => {
    it.each(["a", "s", "r", "^", "Tab", "Shift", "Backspace", "F5", " "])("ignores %j", (key) => {
      setMode("pro");
      type("5");
      const event = pressOne(key);
      expect(display()).toBe("5");
      expect(expression()).toBe("5");
      expect(event.defaultPrevented).toBe(false);
    });

    it("does not give x² or √ a shortcut", () => {
      setMode("pro");
      type("9");
      for (const key of ["²", "√", "x", "q"]) pressOne(key);
      expect(expression()).toBe("9");
    });

    it("ignores browser shortcuts such as Ctrl+5 and Ctrl++", () => {
      type("3");
      pressOne("5", { ctrlKey: true });
      pressOne("+", { ctrlKey: true });
      pressOne("=", { metaKey: true });
      expect(display()).toBe("3");
    });

    it("ignores keys typed into a text field", () => {
      const field = document.body.appendChild(document.createElement("input"));
      pressOne("7", {}, field);
      pressOne("Enter", {}, field);
      expect(display()).toBe("0");
    });

    it("ignores held-down repeats", () => {
      pressOne("5");
      pressOne("5", { repeat: true });
      expect(display()).toBe("5");
    });

    it("leaves Enter on a focused settings switch to that switch", () => {
      type("2+3");
      const event = pressOne("Enter", {}, document.querySelector('[data-setting="appearance"]')!);
      expect(event.defaultPrevented).toBe(false);
      expect(display()).toBe("5");
    });
  });

  describe("separate state and independent settings", () => {
    it("keeps NORMAL and PRO states apart while typing on the keyboard", () => {
      setMode("normal");
      type("12+34");
      setMode("pro");
      expect(display()).toBe("0");
      type("(2+3)*4");
      expect(expression()).toBe("(2 + 3) × 4");

      setMode("normal");
      expect(display()).toBe("46");
      expect(expression()).toBe("12 + 34");
      type(">");
      expect(display()).toBe("46");

      setMode("pro");
      type(">");
      expect(display()).toBe("20");
    });

    it("switching LIGHT/DARK keeps the calculator type and the keyboard state", () => {
      setMode("pro");
      type("2+3*4");
      click('[data-setting="appearance"]');

      expect(document.querySelector('[data-setting="calculator-mode"] .mode-toggle__label')?.textContent).toBe("PRO MODE");
      expect(expression()).toBe("2 + 3 × 4");
      type(">");
      expect(display()).toBe("14");

      click('[data-setting="appearance"]');
      expect(display()).toBe("14");
    });
  });

  describe("listener lifecycle", () => {
    it("handles one key press once, even if start() is called again", () => {
      app.start();
      type("5");
      expect(display()).toBe("5");
    });

    it("ignores keys after dispose()", () => {
      app.dispose();
      const event = pressOne("5");
      expect(display()).toBe("0");
      expect(event.defaultPrevented).toBe(false);
    });

    it("a replacement app takes over without double handling", () => {
      app.dispose();
      app = createApp();
      app.start();
      type("5");
      expect(display()).toBe("5");
    });
  });
});
