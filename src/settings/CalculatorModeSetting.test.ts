import { describe, expect, it } from "vitest";
import { CalculatorModeSetting } from "./CalculatorModeSetting";
import settingSource from "./CalculatorModeSetting.ts?raw";

describe("CalculatorModeSetting", () => {
  it("starts as the NORMAL calculator", () => {
    expect(new CalculatorModeSetting().mode).toBe("normal");
  });

  it("toggles to PRO and back", () => {
    const setting = new CalculatorModeSetting();

    expect(setting.toggle()).toBe("pro");
    expect(setting.mode).toBe("pro");
    expect(setting.toggle()).toBe("normal");
    expect(setting.mode).toBe("normal");
  });

  it("alternates over many switches", () => {
    const setting = new CalculatorModeSetting();
    for (let index = 1; index <= 20; index++) {
      expect(setting.toggle()).toBe(index % 2 === 1 ? "pro" : "normal");
    }
  });

  it("keeps instances independent", () => {
    const first = new CalculatorModeSetting();
    const second = new CalculatorModeSetting();

    first.toggle();
    expect(first.mode).toBe("pro");
    expect(second.mode).toBe("normal");
  });

  describe("is only a setting", () => {
    const code = settingSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it("touches no DOM and imports nothing", () => {
      expect(code).not.toMatch(/\bimport\b/);
      for (const global of ["document", "window", "classList", "localStorage", "HTMLElement"]) {
        expect(code, global).not.toMatch(new RegExp(`\\b${global}\\b`));
      }
    });

    it("does not know about the appearance", () => {
      expect(code).not.toMatch(/ThemeManager|Appearance|"light"|"dark"/);
    });
  });
});
