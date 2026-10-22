// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeManager } from "./ThemeManager";

describe("ThemeManager", () => {
  let root: HTMLElement;
  let manager: ThemeManager;

  beforeEach(() => {
    root = document.createElement("div");
    manager = new ThemeManager(root);
  });

  it("starts in normal mode without the pro class", () => {
    expect(manager.mode).toBe("normal");
    expect(root.classList.contains("theme-pro")).toBe(false);
  });

  it("switches to pro mode and adds the pro class", () => {
    expect(manager.toggle()).toBe("pro");
    expect(manager.mode).toBe("pro");
    expect(root.classList.contains("theme-pro")).toBe(true);
  });

  it("switches back to normal mode and removes the pro class", () => {
    manager.toggle();
    expect(manager.toggle()).toBe("normal");
    expect(root.classList.contains("theme-pro")).toBe(false);
  });

  it("only touches its own class", () => {
    root.classList.add("other");
    manager.toggle();
    manager.toggle();
    expect(root.classList.contains("other")).toBe(true);
  });
});
