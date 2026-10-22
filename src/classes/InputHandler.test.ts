// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputHandler } from "./InputHandler";

const MARKUP = `
  <button class="mode-toggle">mode</button>
  <div class="keypad">
    <button data-action="clear">AC</button>
    <button data-action="toggle-sign">+/-</button>
    <button data-action="percent">%</button>
    <button data-operator="divide">÷</button>
    <button data-operator="modulo">?</button>
    <button data-number="7">7</button>
    <button data-number="0">0</button>
    <button data-action="decimal">.</button>
    <button data-action="equals">=</button>
  </div>
`;

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = MARKUP;
  document.body.append(root);
  return root;
}

const click = (root: ParentNode, selector: string): void => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`No element for ${selector}`);
  element.click();
};

describe("InputHandler", () => {
  let root: HTMLElement;
  let handler: InputHandler;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = createRoot();
    handler = new InputHandler(root);
  });

  describe("registration", () => {
    const simpleBindings: Array<[string, keyof InputHandler, string]> = [
      ["mode toggle", "onModeToggle", ".mode-toggle"],
      ["AC", "onClear", '[data-action="clear"]'],
      ["decimal", "onDecimal", '[data-action="decimal"]'],
      ["+/-", "onToggleSign", '[data-action="toggle-sign"]'],
      ["%", "onPercent", '[data-action="percent"]'],
      ["=", "onEquals", '[data-action="equals"]'],
    ];

    it.each(simpleBindings)("calls the %s callback exactly once per click", (_name, method, selector) => {
      const callback = vi.fn();
      (handler[method] as (cb: () => void) => void).call(handler, callback);

      click(root, selector);
      expect(callback).toHaveBeenCalledTimes(1);

      click(root, selector);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("registers nothing until a callback is bound", () => {
      const spy = vi.spyOn(HTMLElement.prototype, "addEventListener");
      new InputHandler(root);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("passes the digit of the clicked number button", () => {
      const callback = vi.fn();
      handler.onNumber(callback);

      click(root, '[data-number="7"]');
      click(root, '[data-number="0"]');

      expect(callback.mock.calls).toEqual([["7"], ["0"]]);
    });

    it("passes the operator of the clicked operator button", () => {
      const callback = vi.fn();
      handler.onOperator(callback);

      click(root, '[data-operator="divide"]');

      expect(callback).toHaveBeenCalledExactlyOnceWith("divide");
    });

    it("ignores operator buttons with an unknown operator", () => {
      const callback = vi.fn();
      handler.onOperator(callback);

      click(root, '[data-operator="modulo"]');

      expect(callback).not.toHaveBeenCalled();
    });

    it("does not treat other keys as numbers or operators", () => {
      const onNumber = vi.fn();
      const onOperator = vi.fn();
      handler.onNumber(onNumber);
      handler.onOperator(onOperator);

      click(root, '[data-action="decimal"]');
      click(root, '[data-action="equals"]');
      click(root, ".keypad");

      expect(onNumber).not.toHaveBeenCalled();
      expect(onOperator).not.toHaveBeenCalled();
    });

    it("handles clicks on elements nested inside a button", () => {
      root.querySelector('[data-number="7"]')!.innerHTML = "<span>7</span>";
      const callback = vi.fn();
      handler.onNumber(callback);

      click(root, '[data-number="7"] span');

      expect(callback).toHaveBeenCalledExactlyOnceWith("7");
    });

    it("does nothing when an element is missing from the root", () => {
      root.innerHTML = "";
      expect(() => {
        handler.onClear(vi.fn());
        handler.onNumber(vi.fn());
        handler.onModeToggle(vi.fn());
      }).not.toThrow();
    });
  });

  describe("scope", () => {
    it("ignores identical buttons outside its root", () => {
      const outside = createRoot();
      const inside = vi.fn();
      handler.onClear(inside);
      handler.onNumber(inside);

      click(outside, '[data-action="clear"]');
      click(outside, '[data-number="7"]');

      expect(inside).not.toHaveBeenCalled();
    });

    it("keeps two handlers on two roots independent", () => {
      const otherRoot = createRoot();
      const otherHandler = new InputHandler(otherRoot);
      const first = vi.fn();
      const second = vi.fn();
      handler.onNumber(first);
      otherHandler.onNumber(second);

      click(root, '[data-number="7"]');

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("stops every kind of listener", () => {
      const spies = {
        modeToggle: vi.fn(),
        clear: vi.fn(),
        decimal: vi.fn(),
        toggleSign: vi.fn(),
        percent: vi.fn(),
        equals: vi.fn(),
        number: vi.fn(),
        operator: vi.fn(),
      };
      handler.onModeToggle(spies.modeToggle);
      handler.onClear(spies.clear);
      handler.onDecimal(spies.decimal);
      handler.onToggleSign(spies.toggleSign);
      handler.onPercent(spies.percent);
      handler.onEquals(spies.equals);
      handler.onNumber(spies.number);
      handler.onOperator(spies.operator);

      handler.dispose();

      for (const selector of [
        ".mode-toggle",
        '[data-action="clear"]',
        '[data-action="decimal"]',
        '[data-action="toggle-sign"]',
        '[data-action="percent"]',
        '[data-action="equals"]',
        '[data-number="7"]',
        '[data-operator="divide"]',
      ]) {
        click(root, selector);
      }

      for (const spy of Object.values(spies)) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it("only removes its own listeners", () => {
      const otherHandler = new InputHandler(root);
      const kept = vi.fn();
      const removed = vi.fn();
      otherHandler.onNumber(kept);
      handler.onNumber(removed);

      handler.dispose();
      click(root, '[data-number="7"]');

      expect(kept).toHaveBeenCalledTimes(1);
      expect(removed).not.toHaveBeenCalled();
    });

    it("is safe to call more than once", () => {
      handler.onClear(vi.fn());
      expect(() => {
        handler.dispose();
        handler.dispose();
      }).not.toThrow();
    });

    it("cannot register new listeners after being disposed", () => {
      handler.dispose();
      const callback = vi.fn();
      handler.onClear(callback);
      handler.onNumber(callback);

      click(root, '[data-action="clear"]');
      click(root, '[data-number="7"]');

      expect(callback).not.toHaveBeenCalled();
    });

    it("does not even attach listeners after being disposed", () => {
      handler.dispose();
      const spy = vi.spyOn(HTMLElement.prototype, "addEventListener");

      handler.onClear(vi.fn());
      handler.onNumber(vi.fn());
      handler.onModeToggle(vi.fn());

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("does not affect a new handler created on the same root afterwards", () => {
      handler.onNumber(vi.fn());
      handler.dispose();

      const replacement = new InputHandler(root);
      const callback = vi.fn();
      replacement.onNumber(callback);
      click(root, '[data-number="7"]');

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
