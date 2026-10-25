// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import { CalculatorEngine } from "../calculator/CalculatorEngine";
import { CalculatorModeSetting, type CalculatorMode } from "../settings/CalculatorModeSetting";
import styles from "../styles/style.css?raw";
import { ThemeManager, type Appearance } from "../themes/ThemeManager";
import { CalculatorUI } from "../ui/CalculatorUI";
import { CalculatorApp } from "./CalculatorApp";
import { InputHandler } from "./InputHandler";

// ---------------------------------------------------------------- helpers

/** The class the stylesheet keys its dark colours on (a legacy name for "dark appearance"). */
const DARK_CLASS = "theme-pro";

function loadPage(): void {
  document.body.className = "";
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
  document.body.querySelector("script")?.remove();
}

function startApp() {
  const root = document.querySelector<HTMLElement>(".app")!;
  const engine = new CalculatorEngine();
  const themeManager = new ThemeManager(document.body);
  const calculatorMode = new CalculatorModeSetting();
  const app = new CalculatorApp(engine, new CalculatorUI(root), themeManager, new InputHandler(root), calculatorMode);
  app.start();
  return { app, engine, themeManager, calculatorMode, root };
}

const typePill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="calculator-mode"]')!;
const lookPill = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-setting="appearance"]')!;
const labelOf = (pill: HTMLElement): string => pill.querySelector(".mode-toggle__label")?.textContent ?? "";

/** Everything the user can see or a screen reader can read about the two switches. */
function shown() {
  return {
    typeText: labelOf(typePill()),
    typeOn: typePill().getAttribute("aria-checked"),
    lookText: labelOf(lookPill()),
    lookOn: lookPill().getAttribute("aria-checked"),
    dark: document.body.classList.contains(DARK_CLASS),
  };
}

const OPERATORS: Record<string, string> = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };
const displayText = (): string => document.querySelector(".display__value")?.textContent ?? "";

/** Presses the real calculator buttons, one character each. */
function press(keys: string): void {
  for (const key of keys.replace(/\s+/g, "")) {
    const selector =
      /\d/.test(key) ? `[data-number="${key}"]`
      : key === "." ? '[data-action="decimal"]'
      : key === "=" ? '[data-action="equals"]'
      : key === "%" ? '[data-action="percent"]'
      : key === "S" ? '[data-action="toggle-sign"]'
      : key === "C" ? '[data-action="clear"]'
      : `[data-operator="${OPERATORS[key]}"]`;
    document.querySelector<HTMLButtonElement>(selector)!.click();
  }
}

const EXPECTED_AFTER: Record<string, { typeText: string; typeOn: string; lookText: string; lookOn: string; dark: boolean }> = {
  "normal+light": { typeText: "NORMAL MODE", typeOn: "false", lookText: "LIGHT MODE", lookOn: "false", dark: false },
  "normal+dark": { typeText: "NORMAL MODE", typeOn: "false", lookText: "DARK MODE", lookOn: "true", dark: true },
  "pro+light": { typeText: "PRO MODE", typeOn: "true", lookText: "LIGHT MODE", lookOn: "false", dark: false },
  "pro+dark": { typeText: "PRO MODE", typeOn: "true", lookText: "DARK MODE", lookOn: "true", dark: true },
};

beforeEach(() => {
  loadPage();
});

// ---------------------------------------------------------------- the markup

describe("the two toggle pills in the page", () => {
  it("sit together in one labelled group directly above the calculator", () => {
    const settings = document.querySelector(".settings")!;
    const app = document.querySelector(".app")!;

    expect(settings.getAttribute("role")).toBe("group");
    expect(settings.getAttribute("aria-label")).toBeTruthy();
    expect([...app.children].map((child) => child.className)).toEqual(["settings", "calculator"]);
    expect(settings.nextElementSibling).toBe(document.querySelector(".calculator"));
  });

  it("are stacked in the order calculator type, then appearance", () => {
    const pills = [...document.querySelectorAll(".settings > button")];
    expect(pills.map((pill) => pill.getAttribute("data-setting"))).toEqual(["calculator-mode", "appearance"]);
    expect(pills).toHaveLength(2);
  });

  it("are the same pill twice: same class, same inner structure", () => {
    for (const pill of [typePill(), lookPill()]) {
      expect(pill.tagName).toBe("BUTTON");
      expect(pill.getAttribute("type")).toBe("button");
      expect(pill.className).toBe("mode-toggle");
      expect([...pill.children].map((child) => child.className)).toEqual(["mode-toggle__label", "mode-toggle__knob"]);
      expect(pill.querySelector(".mode-toggle__knob")!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("start as NORMAL MODE and LIGHT MODE, both switched off", () => {
    expect(shown()).toEqual(EXPECTED_AFTER["normal+light"]);
  });

  describe("accessibility", () => {
    it("are both switches", () => {
      expect(typePill().getAttribute("role")).toBe("switch");
      expect(lookPill().getAttribute("role")).toBe("switch");
    });

    it("have different, meaningful names that say which setting they change", () => {
      const typeName = typePill().getAttribute("aria-label")!;
      const lookName = lookPill().getAttribute("aria-label")!;

      expect(typeName).not.toBe(lookName);
      expect(typeName).toMatch(/calculator type/i);
      expect(lookName).toMatch(/appearance/i);
    });

    it("name the state that 'on' means, so the switch reads correctly (on = PRO / on = DARK)", () => {
      expect(typePill().getAttribute("aria-label")).toContain("PRO MODE");
      expect(lookPill().getAttribute("aria-label")).toContain("DARK MODE");
    });

    it("keep their names while the visible text and state change", () => {
      const names = [typePill().getAttribute("aria-label"), lookPill().getAttribute("aria-label")];
      startApp();

      typePill().click();
      lookPill().click();
      expect([typePill().getAttribute("aria-label"), lookPill().getAttribute("aria-label")]).toEqual(names);
    });

    it("report their state only through aria-checked", () => {
      startApp();
      for (const pill of [typePill(), lookPill()]) {
        expect(pill.getAttribute("aria-checked")).toBe("false");
        pill.click();
        expect(pill.getAttribute("aria-checked")).toBe("true");
        pill.click();
        expect(pill.getAttribute("aria-checked")).toBe("false");
      }
    });
  });

  describe("no unfinished PRO features are shown", () => {
    it("the visible keypad is still exactly the NORMAL one (the PRO-only row is hidden)", () => {
      const keys = [...document.querySelectorAll(".keypad button")]
        .filter((button) => !button.closest("[hidden]"))
        .map((button) => button.textContent!.trim());

      expect(keys).toHaveLength(19);
      expect(keys).toEqual(["AC", "+/-", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="]);
      for (const proKey of ["(", ")", "x²", "√"]) expect(keys).not.toContain(proKey);
    });

    it("the expression line is shown for both calculators, above the single value", () => {
      expect(document.querySelector<HTMLElement>(".display__expression")!.hidden).toBe(false);
      expect(document.querySelectorAll(".display > *:not([hidden])")).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------- the stylesheet

describe("the stylesheet for the pills", () => {
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(styles)?.[1] ?? "";
  };

  it("only lays the pills out: the group is a column with a gap", () => {
    const body = rule(".settings");

    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-direction:\s*column/);
    expect(body).toMatch(/gap:\s*12px/);
  });

  it("adds no colour, shadow, font or size of its own", () => {
    const properties = [...rule(".settings").matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]);

    expect(properties.sort()).toEqual(["align-items", "display", "flex-direction", "gap"]);
    expect(rule(".settings")).not.toMatch(/#|rgb|var\(|shadow|background|color|font/);
  });

  it("does not restyle either pill separately: both use the one .mode-toggle design", () => {
    expect(styles).not.toContain("data-setting");
    expect(styles).not.toMatch(/\.settings\s+\.mode-toggle/);
    expect((styles.match(/\.mode-toggle\s*\{/g) ?? []).length).toBe(1);
  });

  it("still keys the dark colours on the same class", () => {
    expect(styles).toContain(`body.${DARK_CLASS}`);
  });
});

// ---------------------------------------------------------------- behaviour

describe("the two toggles are independent", () => {
  it("the first one changes the calculator type and nothing else", () => {
    const { calculatorMode, themeManager } = startApp();

    typePill().click();

    expect(calculatorMode.mode).toBe("pro");
    expect(themeManager.appearance).toBe("light");
    expect(shown()).toEqual(EXPECTED_AFTER["pro+light"]);
    expect(document.body.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("the second one changes the appearance and nothing else", () => {
    const { calculatorMode, themeManager } = startApp();

    lookPill().click();

    expect(themeManager.appearance).toBe("dark");
    expect(calculatorMode.mode).toBe("normal");
    expect(shown()).toEqual(EXPECTED_AFTER["normal+dark"]);
  });

  describe("all four combinations, whichever order the pills are pressed in", () => {
    it.each<[string, ("type" | "look")[], CalculatorMode, Appearance]>([
      ["nothing pressed", [], "normal", "light"],
      ["appearance only", ["look"], "normal", "dark"],
      ["calculator type only", ["type"], "pro", "light"],
      ["type then appearance", ["type", "look"], "pro", "dark"],
      ["appearance then type", ["look", "type"], "pro", "dark"],
      ["type, appearance, type again", ["type", "look", "type"], "normal", "dark"],
      ["type, appearance, appearance again", ["type", "look", "look"], "pro", "light"],
      ["both, then both back", ["type", "look", "type", "look"], "normal", "light"],
    ])("%s", (_label, clicks, mode, appearance) => {
      const { calculatorMode, themeManager } = startApp();

      for (const click of clicks) (click === "type" ? typePill() : lookPill()).click();

      expect(calculatorMode.mode).toBe(mode);
      expect(themeManager.appearance).toBe(appearance);
      expect(shown()).toEqual(EXPECTED_AFTER[`${mode}+${appearance}`]);
    });
  });

  it("each pill works in both appearances and with both calculator types", () => {
    const { calculatorMode, themeManager } = startApp();

    for (const mode of ["normal", "pro"] as const) {
      if (calculatorMode.mode !== mode) typePill().click();
      for (const appearance of ["light", "dark"] as const) {
        if (themeManager.appearance !== appearance) lookPill().click();
        const before = shown();

        typePill().click();
        typePill().click();
        lookPill().click();
        lookPill().click();

        expect(shown(), `${mode} + ${appearance}`).toEqual(before);
      }
    }
  });

  it("matches a simple model over 2000 random presses of the two pills", () => {
    const { calculatorMode, themeManager } = startApp();
    let seed = 99;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let mode: CalculatorMode = "normal";
    let appearance: Appearance = "light";
    const seen = new Set<string>();

    for (let step = 0; step < 2000; step++) {
      if (random() < 0.5) {
        typePill().click();
        mode = mode === "normal" ? "pro" : "normal";
      } else {
        lookPill().click();
        appearance = appearance === "light" ? "dark" : "light";
      }

      expect(calculatorMode.mode).toBe(mode);
      expect(themeManager.appearance).toBe(appearance);
      expect(shown()).toEqual(EXPECTED_AFTER[`${mode}+${appearance}`]);
      seen.add(`${mode}+${appearance}`);
    }
    expect([...seen].sort()).toEqual(["normal+dark", "normal+light", "pro+dark", "pro+light"]);
  }, 30_000);
});

// ---------------------------------------------------------------- the calculator is left alone

describe("each mode keeps its own calculation", () => {
  it("keeps a half-typed NORMAL calculation across appearance switches, then finishes it", () => {
    const { engine } = startApp();
    press("123+4");
    const before = { display: displayText(), phase: engine.phase };

    for (let round = 0; round < 6; round++) {
      lookPill().click();
      expect(displayText()).toBe(before.display);
    }

    expect({ display: displayText(), phase: engine.phase }).toEqual(before);
    press("=");
    expect(displayText()).toBe("127");
  });

  it("switching modes preserves each calculator's own calculation", () => {
    startApp();
    press("123+4");
    expect(displayText()).toBe("127");

    typePill().click(); // PRO starts on its own, empty calculation
    expect(displayText()).toBe("0");
    press("9+8");
    expect(displayText()).toBe("17");

    typePill().click(); // back to NORMAL: its half-typed sum is still there
    expect(displayText()).toBe("127");
    press("=");
    expect(displayText()).toBe("127");

    typePill().click(); // and PRO's is still there too
    expect(displayText()).toBe("17");
    press("=");
    expect(displayText()).toBe("17");
  });

  it("is not reset by switching, even in the middle of a result chain", () => {
    startApp();
    press("2+3=");
    typePill().click();
    typePill().click();
    lookPill().click();
    expect(displayText()).toBe("5");

    press("*4=");
    expect(displayText()).toBe("20");
  });

  describe("every mode and appearance combination calculates by its own rules", () => {
    it.each(["normal+light", "normal+dark", "pro+light", "pro+dark"])("%s", (combination) => {
      startApp();
      if (combination.startsWith("pro")) typePill().click();
      if (combination.endsWith("dark")) lookPill().click();
      expect(shown()).toEqual(EXPECTED_AFTER[combination]);

      const pro = combination.startsWith("pro");
      const cases: [string, string][] = [
        ["2+3*4=", pro ? "14" : "20"],
        ["200+10%=", "220"],
        ["200-10%=", "180"],
        ["1/3*3=", "1"],
        ["0.1+0.2=", "0.3"],
        ["5S+3=", "-2"],
        ["5/0=", "Error"],
        ["7=", "7"],
      ];
      for (const [keys, expected] of cases) {
        press(`C${keys}`);
        expect(displayText(), `${combination}: ${keys}`).toBe(expected);
      }
      expect(shown()).toEqual(EXPECTED_AFTER[combination]);
    });
  });

  it("NORMAL uses left-to-right rules and PRO uses standard precedence", () => {
    startApp();
    press("2+3*4=");
    expect(displayText()).toBe("20");

    typePill().click();
    press("2+3*4=");
    expect(displayText()).toBe("14");
  });
});

// ---------------------------------------------------------------- initial state

describe("the pills show the settings the app starts with", () => {
  function startWith(mode: CalculatorModeSetting, theme: ThemeManager): void {
    const root = document.querySelector<HTMLElement>(".app")!;
    new CalculatorApp(new CalculatorEngine(), new CalculatorUI(root), theme, new InputHandler(root), mode).start();
  }

  it.each<[string, boolean, boolean]>([
    ["normal+light", false, false],
    ["normal+dark", false, true],
    ["pro+light", true, false],
    ["pro+dark", true, true],
  ])("%s", (combination, pro, dark) => {
    const mode = new CalculatorModeSetting();
    const theme = new ThemeManager(document.body);
    if (pro) mode.toggle();
    if (dark) theme.toggle();

    startWith(mode, theme);

    expect(shown()).toEqual(EXPECTED_AFTER[combination]);
  });

  it("and the first press then switches them back", () => {
    const mode = new CalculatorModeSetting();
    const theme = new ThemeManager(document.body);
    mode.toggle();
    theme.toggle();
    startWith(mode, theme);

    typePill().click();
    lookPill().click();

    expect(shown()).toEqual(EXPECTED_AFTER["normal+light"]);
  });
});

// ---------------------------------------------------------------- listeners

describe("the toggles' listeners", () => {
  it("fire once per click, even if start() is called twice", () => {
    const { app, calculatorMode, themeManager } = startApp();
    app.start();

    typePill().click();
    expect(calculatorMode.mode).toBe("pro");
    lookPill().click();
    expect(themeManager.appearance).toBe("dark");
    expect(shown()).toEqual(EXPECTED_AFTER["pro+dark"]);
  });

  it("are removed by dispose()", () => {
    const { app, calculatorMode, themeManager } = startApp();
    app.dispose();

    typePill().click();
    lookPill().click();

    expect(calculatorMode.mode).toBe("normal");
    expect(themeManager.appearance).toBe("light");
    expect(shown()).toEqual(EXPECTED_AFTER["normal+light"]);
  });

  it("a new app can take over the same page after dispose(), still once per click", () => {
    startApp().app.dispose();
    const second = startApp();

    typePill().click();
    lookPill().click();

    expect(second.calculatorMode.mode).toBe("pro");
    expect(second.themeManager.appearance).toBe("dark");
    expect(shown()).toEqual(EXPECTED_AFTER["pro+dark"]);
  });
});
