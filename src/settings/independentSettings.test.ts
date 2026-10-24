// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { ProCalculator } from "../calculator/pro/ProCalculator";
import { ThemeManager, type Appearance } from "../themes/ThemeManager";
import { CalculatorModeSetting, type CalculatorMode } from "./CalculatorModeSetting";

/** The class the stylesheet keys its dark colours on (a legacy name for "dark appearance"). */
const DARK_CLASS = "theme-pro";

describe("calculator mode and appearance are independent settings", () => {
  let root: HTMLElement;
  let theme: ThemeManager;
  let calculatorMode: CalculatorModeSetting;

  beforeEach(() => {
    root = document.createElement("div");
    theme = new ThemeManager(root);
    calculatorMode = new CalculatorModeSetting();
  });

  const state = (): { mode: CalculatorMode; appearance: Appearance; darkClass: boolean } => ({
    mode: calculatorMode.mode,
    appearance: theme.appearance,
    darkClass: root.classList.contains(DARK_CLASS),
  });

  it("starts as NORMAL + LIGHT", () => {
    expect(state()).toEqual({ mode: "normal", appearance: "light", darkClass: false });
  });

  describe("all four combinations can be reached, whichever order the switches are made in", () => {
    it.each<[string, ("mode" | "theme")[], CalculatorMode, Appearance]>([
      ["nothing switched", [], "normal", "light"],
      ["appearance only", ["theme"], "normal", "dark"],
      ["calculator mode only", ["mode"], "pro", "light"],
      ["mode then appearance", ["mode", "theme"], "pro", "dark"],
      ["appearance then mode", ["theme", "mode"], "pro", "dark"],
      ["both, then back again", ["mode", "theme", "mode", "theme"], "normal", "light"],
      ["mode back only", ["mode", "theme", "mode"], "normal", "dark"],
      ["appearance back only", ["mode", "theme", "theme"], "pro", "light"],
    ])("%s", (_label, switches, mode, appearance) => {
      for (const which of switches) {
        if (which === "mode") calculatorMode.toggle();
        else theme.toggle();
      }
      expect(state()).toEqual({ mode, appearance, darkClass: appearance === "dark" });
    });
  });

  describe("neither setting changes the other", () => {
    it("switching to the PRO calculator does not make the page dark", () => {
      calculatorMode.toggle();

      expect(calculatorMode.mode).toBe("pro");
      expect(theme.appearance).toBe("light");
      expect(root.classList.contains(DARK_CLASS)).toBe(false);
    });

    it("switching to the dark appearance does not switch the calculator", () => {
      theme.toggle();

      expect(theme.appearance).toBe("dark");
      expect(calculatorMode.mode).toBe("normal");
    });

    it("the dark class follows the appearance whichever calculator is active", () => {
      for (const mode of ["normal", "pro"] as const) {
        if (calculatorMode.mode !== mode) calculatorMode.toggle();

        theme.toggle();
        expect(root.classList.contains(DARK_CLASS), `${mode} + dark`).toBe(true);
        theme.toggle();
        expect(root.classList.contains(DARK_CLASS), `${mode} + light`).toBe(false);
      }
    });

    it("follows a simple model over 5000 random switches", () => {
      let seed = 4242;
      const random = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      let expectedMode: CalculatorMode = "normal";
      let expectedAppearance: Appearance = "light";
      const seen = new Set<string>();

      for (let step = 0; step < 5000; step++) {
        if (random() < 0.5) {
          calculatorMode.toggle();
          expectedMode = expectedMode === "normal" ? "pro" : "normal";
        } else {
          theme.toggle();
          expectedAppearance = expectedAppearance === "light" ? "dark" : "light";
        }

        expect(state()).toEqual({ mode: expectedMode, appearance: expectedAppearance, darkClass: expectedAppearance === "dark" });
        seen.add(`${expectedMode}+${expectedAppearance}`);
      }
      expect([...seen].sort()).toEqual(["normal+dark", "normal+light", "pro+dark", "pro+light"]);
    });
  });

  describe("neither setting touches a calculator", () => {
    it("the NORMAL and PRO states are the same in every combination", () => {
      const normal = new CalculatorEngine();
      for (const key of "123") normal.inputDigit(key);
      normal.setOperator("add");
      normal.inputDigit("4");

      const pro = new ProCalculator();
      for (const key of "2") pro.inputDigit(key);
      pro.setOperator("multiply");
      pro.openParenthesis();
      pro.inputDigit("3");

      const before = [normal.displayValue, normal.phase, pro.displayValue, pro.expressionText, pro.phase];

      for (let index = 0; index < 8; index++) {
        calculatorMode.toggle();
        theme.toggle();
        calculatorMode.toggle();
      }

      expect([normal.displayValue, normal.phase, pro.displayValue, pro.expressionText, pro.phase]).toEqual(before);

      // and both calculators still work from where they were
      normal.equals();
      expect(normal.displayValue).toBe("127");
      pro.closeParenthesis();
      pro.equals();
      expect(pro.displayValue).toBe("6");
    });
  });

  describe("separate instances do not interfere", () => {
    it("two appearances on two roots", () => {
      const otherRoot = document.createElement("div");
      const otherTheme = new ThemeManager(otherRoot);

      theme.toggle();

      expect(otherTheme.appearance).toBe("light");
      expect(otherRoot.classList.contains(DARK_CLASS)).toBe(false);
    });

    it("two calculator-mode settings", () => {
      const other = new CalculatorModeSetting();

      calculatorMode.toggle();

      expect(other.mode).toBe("normal");
    });
  });
});
