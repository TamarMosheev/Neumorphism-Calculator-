// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeManager } from "../themes/ThemeManager";
import indexHtml from "../../index.html?raw";
import styles from "../styles/style.css?raw";
import uiSource from "../ui/CalculatorUI.ts?raw";
import { CalculatorModeSetting } from "./CalculatorModeSetting";
import { PreferenceStore, type PreferenceStorage } from "./PreferenceStore";
import { UserPreferences } from "./UserPreferences";

const MODE_KEY = "calculator.mode";
const APPEARANCE_KEY = "calculator.appearance";

/** An in-memory stand-in for localStorage that records every write. */
class MemoryStorage implements PreferenceStorage {
  readonly items = new Map<string, string>();
  readonly writes: string[] = [];

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.items.set(key, value);
  }
}

describe("PreferenceStore", () => {
  it("returns a stored value that is allowed", () => {
    const storage = new MemoryStorage();
    storage.setItem("k", "pro");

    expect(new PreferenceStore(storage).read("k", ["normal", "pro"])).toBe("pro");
  });

  it.each([null, "", "PRO", " pro", "pro ", "banana", "{}", "null", "undefined", "0"])("treats %j as nothing saved", (stored) => {
    const storage = new MemoryStorage();
    if (stored !== null) storage.setItem("k", stored);

    expect(new PreferenceStore(storage).read("k", ["normal", "pro"])).toBeNull();
  });

  it("round-trips what it writes", () => {
    const store = new PreferenceStore(new MemoryStorage());
    store.write("k", "dark");

    expect(store.read("k", ["light", "dark"])).toBe("dark");
  });

  it("works without any storage at all", () => {
    const store = new PreferenceStore(null);

    expect(() => store.write("k", "dark")).not.toThrow();
    expect(store.read("k", ["light", "dark"])).toBeNull();
  });

  it("never throws when the storage refuses to read or write", () => {
    const hostile: PreferenceStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    const store = new PreferenceStore(hostile);

    expect(store.read("k", ["a"])).toBeNull();
    expect(() => store.write("k", "a")).not.toThrow();
  });

  it("falls back to no storage when reaching localStorage itself throws", () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    const store = new PreferenceStore();
    expect(store.read("k", ["a"])).toBeNull();
    expect(() => store.write("k", "a")).not.toThrow();
    spy.mockRestore();
  });
});

describe("UserPreferences", () => {
  it("has nothing saved at first", () => {
    const preferences = new UserPreferences(new PreferenceStore(new MemoryStorage()));

    expect(preferences.savedCalculatorMode()).toBeUndefined();
    expect(preferences.savedAppearance()).toBeUndefined();
  });

  it("saves the two preferences under their own keys, independently", () => {
    const storage = new MemoryStorage();
    const preferences = new UserPreferences(new PreferenceStore(storage));

    preferences.saveCalculatorMode("pro");
    expect([...storage.items]).toEqual([[MODE_KEY, "pro"]]);
    expect(preferences.savedAppearance()).toBeUndefined();

    preferences.saveAppearance("dark");
    expect(Object.fromEntries(storage.items)).toEqual({ [MODE_KEY]: "pro", [APPEARANCE_KEY]: "dark" });
    expect(preferences.savedCalculatorMode()).toBe("pro");
    expect(preferences.savedAppearance()).toBe("dark");
  });

  it("ignores a mode in the appearance slot and the reverse", () => {
    const storage = new MemoryStorage();
    storage.setItem(MODE_KEY, "dark");
    storage.setItem(APPEARANCE_KEY, "pro");
    const preferences = new UserPreferences(new PreferenceStore(storage));

    expect(preferences.savedCalculatorMode()).toBeUndefined();
    expect(preferences.savedAppearance()).toBeUndefined();
  });
});

describe("the settings accept a remembered starting value", () => {
  it("CalculatorModeSetting starts in the given mode, and toggles from it", () => {
    const setting = new CalculatorModeSetting("pro");

    expect(setting.mode).toBe("pro");
    expect(setting.toggle()).toBe("normal");
  });

  it("CalculatorModeSetting still starts in NORMAL by default, and also for undefined", () => {
    expect(new CalculatorModeSetting().mode).toBe("normal");
    expect(new CalculatorModeSetting(undefined).mode).toBe("normal");
  });

  it("ThemeManager starts dark with the dark class already on, and toggles from it", () => {
    const root = document.createElement("div");
    const manager = new ThemeManager(root, "dark");

    expect(manager.appearance).toBe("dark");
    expect(root.classList.contains("theme-pro")).toBe(true);
    expect(manager.toggle()).toBe("light");
    expect(root.classList.contains("theme-pro")).toBe(false);
  });

  it("ThemeManager still starts light by default, and also for undefined", () => {
    const plain = document.createElement("div");
    const manager = new ThemeManager(plain, undefined);

    expect(manager.appearance).toBe("light");
    expect(plain.classList.contains("theme-pro")).toBe(false);
  });
});

describe("the inline script in index.html that prevents a light flash", () => {
  const inline = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";

  it("uses the same storage key and dark class as the app", () => {
    expect(inline).toContain(`"${APPEARANCE_KEY}"`);
    expect(inline).toContain('"theme-pro"');
  });

  it("runs before the calculator markup, so the first paint is already correct", () => {
    expect(indexHtml.indexOf("<script>")).toBeLessThan(indexHtml.indexOf('<main class="app">'));
  });

  it.each([
    ["dark", true],
    ["light", false],
    ["banana", false],
    [null, false],
  ])("with %j stored it gives the dark class: %s", (stored, dark) => {
    document.body.className = "";
    localStorage.clear();
    if (stored !== null) localStorage.setItem(APPEARANCE_KEY, stored);

    new Function(inline)();

    expect(document.body.classList.contains("theme-pro")).toBe(dark);
    localStorage.clear();
  });

  it("does nothing, and does not throw, when localStorage is blocked", () => {
    document.body.className = "";
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => new Function(inline)()).not.toThrow();
    expect(document.body.classList.contains("theme-pro")).toBe(false);
    spy.mockRestore();
  });
});

describe("a saved PRO mode keeps the NORMAL layout from showing first", () => {
  const inline = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";
  const html = document.documentElement;
  const run = (): void => void new Function(inline)();

  beforeEach(() => {
    html.className = "";
    document.body.className = "";
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    html.className = "";
    localStorage.clear();
  });

  it("uses the same key, value and class as the app, the stylesheet and CalculatorUI", () => {
    expect(inline).toContain(`"${MODE_KEY}"`);
    expect(inline).toContain('"pro"');
    expect(inline).toContain('"restoring-mode"');
    expect(uiSource).toContain('"restoring-mode"');
  });

  it("the hiding rule is inline in the head, so it applies before the stylesheet is loaded", () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(indexHtml)?.[1] ?? "";

    expect(head).toMatch(/<style>\s*html\.restoring-mode \.app\s*\{\s*visibility:\s*hidden;?\s*\}\s*<\/style>/);
    expect(styles).not.toContain("restoring-mode");
  });

  it("the hiding rule changes nothing but visibility", () => {
    const rule = /<style>\s*html\.restoring-mode \.app\s*\{([^}]*)\}\s*<\/style>/.exec(indexHtml)?.[1] ?? "";

    expect(rule.split(";").map((line) => line.trim()).filter(Boolean)).toEqual(["visibility:hidden"]);
  });

  it("hides the app while a saved PRO mode is restored", () => {
    localStorage.setItem(MODE_KEY, "pro");
    run();

    expect(html.classList.contains("restoring-mode")).toBe(true);
  });

  it.each([
    ["NORMAL saved", "normal"],
    ["an invalid value", "banana"],
    ["the wrong case", "PRO"],
    ["nothing saved", null],
  ])("does not hide anything when %s", (_name, stored) => {
    if (stored !== null) localStorage.setItem(MODE_KEY, stored);
    run();

    expect(html.classList.contains("restoring-mode")).toBe(false);
  });

  it("a saved appearance alone never hides the app, and PRO + DARK does both jobs", () => {
    localStorage.setItem(APPEARANCE_KEY, "dark");
    run();
    expect([isDark(), html.classList.contains("restoring-mode")]).toEqual([true, false]);

    localStorage.setItem(MODE_KEY, "pro");
    run();
    expect([isDark(), html.classList.contains("restoring-mode")]).toEqual([true, true]);
  });

  it("never leaves the app hidden if the page script does not run: a short fallback reveals it", () => {
    localStorage.setItem(MODE_KEY, "pro");
    run();

    vi.advanceTimersByTime(1999);
    expect(html.classList.contains("restoring-mode")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(html.classList.contains("restoring-mode")).toBe(false);
  });

  it("never hides the app when localStorage is unavailable", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(run).not.toThrow();
    expect(html.classList.contains("restoring-mode")).toBe(false);
  });

  it("never hides the app when reading the stored value throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(run).not.toThrow();
    expect(html.classList.contains("restoring-mode")).toBe(false);
  });

  it("the app reveals itself as soon as it has rendered the saved mode", async () => {
    vi.useRealTimers();
    localStorage.setItem(MODE_KEY, "pro");
    run();
    expect(html.classList.contains("restoring-mode")).toBe(true);

    await loadPage();

    expect(html.classList.contains("restoring-mode")).toBe(false);
    expect(shown()).toBe("PRO LIGHT");
    expect(proRowHidden()).toBe(false);
  });

  it("reveals even when the saved mode is NORMAL or nothing was saved", async () => {
    vi.useRealTimers();
    html.classList.add("restoring-mode");

    await loadPage();

    expect(html.classList.contains("restoring-mode")).toBe(false);
  });
});

// ------------------------------------------------------------ the real page, reloaded

const modeToggle = (): HTMLButtonElement => document.querySelector('[data-setting="calculator-mode"]')!;
const appearanceToggle = (): HTMLButtonElement => document.querySelector('[data-setting="appearance"]')!;
const label = (toggle: HTMLElement): string => toggle.querySelector(".mode-toggle__label")?.textContent ?? "";
const display = (): string => document.querySelector(".display__value")?.textContent ?? "";
const expression = (): string => document.querySelector(".display__expression")?.textContent ?? "";
const proRowHidden = (): boolean => document.querySelector("[data-pro-only]")!.hasAttribute("hidden");
const isDark = (): boolean => document.body.classList.contains("theme-pro");
const click = (selector: string): void => document.querySelector<HTMLElement>(selector)!.click();

/** Reports "NORMAL LIGHT", "PRO DARK" and so on, from what the page shows. */
const shown = (): string => `${label(modeToggle()).startsWith("PRO") ? "PRO" : "NORMAL"} ${isDark() ? "DARK" : "LIGHT"}`;

/** A page load: fresh markup, then the real main.ts. */
async function loadPage(): Promise<void> {
  document.body.className = "";
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
  document.body.querySelector("script")?.remove();
  vi.resetModules();
  await import("../main");
}

describe("preferences across reloads of the real page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("first visit: NORMAL and LIGHT, and nothing is written just by loading", async () => {
    await loadPage();

    expect(shown()).toBe("NORMAL LIGHT");
    expect(proRowHidden()).toBe(true);
    expect(label(appearanceToggle())).toBe("LIGHT MODE");
    expect(localStorage.length).toBe(0);
  });

  it.each([
    ["NORMAL LIGHT", [], "NORMAL LIGHT"],
    ["PRO LIGHT", ["mode"], "PRO LIGHT"],
    ["NORMAL DARK", ["theme"], "NORMAL DARK"],
    ["PRO DARK", ["mode", "theme"], "PRO DARK"],
    ["PRO DARK (theme first)", ["theme", "mode"], "PRO DARK"],
    ["back to NORMAL LIGHT", ["mode", "theme", "mode", "theme"], "NORMAL LIGHT"],
    ["PRO LIGHT after toggling the theme twice", ["mode", "theme", "theme"], "PRO LIGHT"],
  ] as const)("%s survives a reload", async (_name, clicks, expected) => {
    await loadPage();
    for (const which of clicks) click(which === "mode" ? '[data-setting="calculator-mode"]' : '[data-setting="appearance"]');
    expect(shown()).toBe(expected);

    await loadPage();

    expect(shown()).toBe(expected);
    expect(proRowHidden()).toBe(!expected.startsWith("PRO"));
    expect(label(modeToggle())).toBe(expected.startsWith("PRO") ? "PRO MODE" : "NORMAL MODE");
    expect(label(appearanceToggle())).toBe(expected.endsWith("DARK") ? "DARK MODE" : "LIGHT MODE");
    expect(modeToggle().getAttribute("aria-checked")).toBe(String(expected.startsWith("PRO")));
    expect(appearanceToggle().getAttribute("aria-checked")).toBe(String(expected.endsWith("DARK")));
  });

  it("saves each preference only when its own toggle is used", async () => {
    await loadPage();

    click('[data-setting="calculator-mode"]');
    expect(Object.fromEntries(Object.entries(localStorage))).toEqual({ [MODE_KEY]: "pro" });

    click('[data-setting="appearance"]');
    expect(Object.fromEntries(Object.entries(localStorage))).toEqual({ [MODE_KEY]: "pro", [APPEARANCE_KEY]: "dark" });

    click('[data-setting="calculator-mode"]');
    expect(Object.fromEntries(Object.entries(localStorage))).toEqual({ [MODE_KEY]: "normal", [APPEARANCE_KEY]: "dark" });
  });

  it("the two preferences are independent when only one was ever saved", async () => {
    localStorage.setItem(APPEARANCE_KEY, "dark");
    await loadPage();
    expect(shown()).toBe("NORMAL DARK");

    localStorage.clear();
    localStorage.setItem(MODE_KEY, "pro");
    await loadPage();
    expect(shown()).toBe("PRO LIGHT");
  });

  it.each([
    ["unknown words", "banana", "banana"],
    ["wrong case", "PRO", "DARK"],
    ["empty strings", "", ""],
    ["a mode where the appearance goes", "dark", "pro"],
    ["JSON", '{"mode":"pro"}', "[1,2]"],
  ])("falls back to the defaults for invalid stored values (%s)", async (_name, mode, appearance) => {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(APPEARANCE_KEY, appearance);

    await loadPage();

    expect(shown()).toBe("NORMAL LIGHT");
  });

  it("an invalid value for one preference does not spoil the other", async () => {
    localStorage.setItem(MODE_KEY, "banana");
    localStorage.setItem(APPEARANCE_KEY, "dark");

    await loadPage();

    expect(shown()).toBe("NORMAL DARK");
  });

  it("keeps working when reading and writing localStorage both fail", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    await loadPage();
    expect(shown()).toBe("NORMAL LIGHT");

    click('[data-setting="calculator-mode"]');
    click('[data-setting="appearance"]');
    expect(shown()).toBe("PRO DARK");
  });

  it("keeps working when localStorage is not available at all", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    await loadPage();
    click('[data-setting="calculator-mode"]');
    click('[data-setting="appearance"]');

    expect(shown()).toBe("PRO DARK");
  });

  it("does not remember the calculation: expressions, results and errors are not stored", async () => {
    await loadPage();
    click('[data-setting="calculator-mode"]');
    for (const selector of ['[data-number="5"]', '[data-operator="add"]', '[data-number="2"]', '[data-action="equals"]']) click(selector);
    expect([display(), expression()]).toEqual(["7", "5 + 2 ="]);

    await loadPage();

    expect(shown()).toBe("PRO LIGHT");
    expect([display(), expression()]).toEqual(["0", ""]);
    expect(Object.keys(Object.fromEntries(Object.entries(localStorage))).sort()).toEqual([MODE_KEY]);
  });

  it("calculations behave the same after a reload: NORMAL left to right, PRO with precedence", async () => {
    const press = (): void => {
      for (const selector of ['[data-number="2"]', '[data-operator="add"]', '[data-number="3"]', '[data-operator="multiply"]', '[data-number="4"]']) {
        click(selector);
      }
    };

    await loadPage();
    press();
    expect([display(), expression()]).toEqual(["20", "2 + 3 × 4"]);

    click('[data-setting="calculator-mode"]');
    click('[data-setting="appearance"]');
    await loadPage();
    press();
    expect(shown()).toBe("PRO DARK");
    expect([display(), expression()]).toEqual(["14", "2 + 3 × 4"]);
  });
});
