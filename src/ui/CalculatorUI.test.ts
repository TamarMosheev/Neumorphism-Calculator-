// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorUI } from "./CalculatorUI";
import { DisplayFitter } from "./DisplayFitter";

const MARKUP = `
  <button class="mode-toggle" data-setting="calculator-mode" role="switch" aria-checked="false">
    <span class="mode-toggle__label">NORMAL MODE</span>
  </button>
  <button class="mode-toggle" data-setting="appearance" role="switch" aria-checked="false">
    <span class="mode-toggle__label">LIGHT MODE</span>
  </button>
  <output class="display__value">0</output>
`;

const pill = (setting: string, parent: ParentNode = document): HTMLElement => parent.querySelector<HTMLElement>(`[data-setting="${setting}"]`)!;
const pillText = (setting: string, parent: ParentNode = document): string | null | undefined =>
  pill(setting, parent).querySelector(".mode-toggle__label")?.textContent;

describe("CalculatorUI", () => {
  let ui: CalculatorUI;

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
    ui = new CalculatorUI(document.body);
  });

  it("renders the display value", () => {
    ui.renderDisplay("123.45");
    expect(document.querySelector(".display__value")?.textContent).toBe("123.45");
  });

  describe("the appearance pill", () => {
    it("shows DARK MODE and switches on for the dark appearance", () => {
      ui.renderAppearance("dark");
      expect(pillText("appearance")).toBe("DARK MODE");
      expect(pill("appearance").getAttribute("aria-checked")).toBe("true");
    });

    it("shows LIGHT MODE and switches off for the light appearance", () => {
      ui.renderAppearance("dark");
      ui.renderAppearance("light");
      expect(pillText("appearance")).toBe("LIGHT MODE");
      expect(pill("appearance").getAttribute("aria-checked")).toBe("false");
    });
  });

  describe("the calculator-type pill", () => {
    it("shows PRO MODE and switches on for the PRO calculator", () => {
      ui.renderCalculatorMode("pro");
      expect(pillText("calculator-mode")).toBe("PRO MODE");
      expect(pill("calculator-mode").getAttribute("aria-checked")).toBe("true");
    });

    it("shows NORMAL MODE and switches off for the NORMAL calculator", () => {
      ui.renderCalculatorMode("pro");
      ui.renderCalculatorMode("normal");
      expect(pillText("calculator-mode")).toBe("NORMAL MODE");
      expect(pill("calculator-mode").getAttribute("aria-checked")).toBe("false");
    });
  });

  it("renders each pill without touching the other", () => {
    ui.renderCalculatorMode("pro");
    expect(pillText("appearance")).toBe("LIGHT MODE");
    expect(pill("appearance").getAttribute("aria-checked")).toBe("false");

    ui.renderAppearance("dark");
    expect(pillText("calculator-mode")).toBe("PRO MODE");
    expect(pill("calculator-mode").getAttribute("aria-checked")).toBe("true");
  });

  it("does not throw when the markup is missing", () => {
    document.body.innerHTML = "";
    expect(() => ui.renderDisplay("1")).not.toThrow();
    expect(() => ui.renderAppearance("dark")).not.toThrow();
    expect(() => ui.renderCalculatorMode("pro")).not.toThrow();
  });

  describe("display fitting", () => {
    let fitter: DisplayFitter;

    beforeEach(() => {
      fitter = new DisplayFitter();
      vi.spyOn(fitter, "fit").mockImplementation(() => undefined);
      ui = new CalculatorUI(document.body, fitter);
    });

    it("fits the display after rendering a value", () => {
      ui.renderDisplay("123456789012346");
      const output = document.querySelector(".display__value");
      expect(fitter.fit).toHaveBeenCalledWith(output);
      expect(output?.textContent).toBe("123456789012346");
    });

    it("renders the full text without truncating it", () => {
      ui.renderDisplay("-9.99999999999998e+29");
      expect(document.querySelector(".display__value")?.textContent).toBe("-9.99999999999998e+29");
    });

    it("refits when the window is resized", () => {
      ui.watchResize();
      vi.mocked(fitter.fit).mockClear();
      window.dispatchEvent(new Event("resize"));
      expect(fitter.fit).toHaveBeenCalledTimes(1);
    });

    it("does not fit when the display is missing", () => {
      document.body.innerHTML = "";
      ui.renderDisplay("1");
      expect(fitter.fit).not.toHaveBeenCalled();
    });
  });
});

describe("CalculatorUI scope and listener lifecycle", () => {
  const MARKUP_COPY = `
    <button class="mode-toggle" data-setting="calculator-mode" role="switch" aria-checked="false">
      <span class="mode-toggle__label">NORMAL MODE</span>
    </button>
    <button class="mode-toggle" data-setting="appearance" role="switch" aria-checked="false">
      <span class="mode-toggle__label">LIGHT MODE</span>
    </button>
    <output class="display__value">0</output>
  `;

  let fitter: DisplayFitter;
  let fit: ReturnType<typeof vi.spyOn>;
  let root: HTMLElement;
  let otherRoot: HTMLElement;
  let ui: CalculatorUI;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    otherRoot = document.createElement("div");
    root.innerHTML = MARKUP_COPY;
    otherRoot.innerHTML = MARKUP_COPY;
    document.body.append(root, otherRoot);

    fitter = new DisplayFitter();
    fit = vi.spyOn(fitter, "fit").mockImplementation(() => undefined);
    ui = new CalculatorUI(root, fitter);
  });

  it("renders only inside its own root", () => {
    ui.renderDisplay("42");
    ui.renderAppearance("dark");
    ui.renderCalculatorMode("pro");

    expect(root.querySelector(".display__value")?.textContent).toBe("42");
    expect(pillText("appearance", root)).toBe("DARK MODE");
    expect(pillText("calculator-mode", root)).toBe("PRO MODE");
    expect(otherRoot.querySelector(".display__value")?.textContent).toBe("0");
    expect(pillText("appearance", otherRoot)).toBe("LIGHT MODE");
    expect(pillText("calculator-mode", otherRoot)).toBe("NORMAL MODE");
  });

  it("fits only its own display", () => {
    ui.renderDisplay("42");
    expect(fit).toHaveBeenCalledExactlyOnceWith(root.querySelector(".display__value"));
  });

  it("adds a single resize listener however often watchResize() is called", () => {
    ui.watchResize();
    ui.watchResize();
    ui.watchResize();
    fit.mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(fit).toHaveBeenCalledTimes(1);
  });

  it("stops refitting after dispose()", () => {
    ui.watchResize();
    ui.dispose();
    fit.mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(fit).not.toHaveBeenCalled();
  });

  it("can watch again after dispose()", () => {
    ui.watchResize();
    ui.dispose();
    ui.watchResize();
    fit.mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(fit).toHaveBeenCalledTimes(1);
  });

  it("is safe to dispose without watching, and twice", () => {
    expect(() => {
      ui.dispose();
      ui.dispose();
    }).not.toThrow();
  });

  it("keeps rendering after dispose() (only the resize listener is removed)", () => {
    ui.dispose();
    ui.renderDisplay("7");
    expect(root.querySelector(".display__value")?.textContent).toBe("7");
  });
});
