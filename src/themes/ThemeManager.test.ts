// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import styles from "../styles/style.css?raw";
import { ThemeManager } from "./ThemeManager";
import themeManagerSource from "./ThemeManager.ts?raw";

/** The class the stylesheet keys its dark colours on (a legacy name, kept until the CSS itself changes). */
const DARK_CLASS = "theme-pro";

describe("ThemeManager", () => {
  let root: HTMLElement;
  let manager: ThemeManager;

  beforeEach(() => {
    root = document.createElement("div");
    manager = new ThemeManager(root);
  });

  it("starts in the light appearance without the dark class", () => {
    expect(manager.appearance).toBe("light");
    expect(root.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("switches to the dark appearance and adds the dark class", () => {
    expect(manager.toggle()).toBe("dark");
    expect(manager.appearance).toBe("dark");
    expect(root.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("switches back to the light appearance and removes the dark class", () => {
    manager.toggle();
    expect(manager.toggle()).toBe("light");
    expect(root.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("only touches its own class", () => {
    root.classList.add("other");
    manager.toggle();
    manager.toggle();
    expect(root.classList.contains("other")).toBe(true);
  });

  it("keeps the class in step with the appearance over many switches", () => {
    for (let index = 1; index <= 20; index++) {
      manager.toggle();
      expect(manager.appearance).toBe(index % 2 === 1 ? "dark" : "light");
      expect(root.classList.contains(DARK_CLASS)).toBe(index % 2 === 1);
    }
  });

  it("defaults to the page body", () => {
    document.body.classList.remove(DARK_CLASS);
    const pageManager = new ThemeManager();

    pageManager.toggle();
    expect(document.body.classList.contains(DARK_CLASS)).toBe(true);
    pageManager.toggle();
    expect(document.body.classList.contains(DARK_CLASS)).toBe(false);
  });

  describe("stays compatible with the stylesheet until the CSS changes", () => {
    it("the stylesheet still keys its dark colours on that class", () => {
      expect(styles).toContain(`body.${DARK_CLASS}`);
    });

    it("the class it toggles is exactly that class", () => {
      expect(themeManagerSource).toContain(`"${DARK_CLASS}"`);
    });
  });

  describe("is about appearance only", () => {
    const code = themeManagerSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it("does not use the calculator-mode vocabulary", () => {
      expect(code).not.toMatch(/"normal"|"pro"|CalculatorMode/);
    });

    it("imports nothing", () => {
      expect(code).not.toMatch(/\bimport\b/);
    });
  });
});
