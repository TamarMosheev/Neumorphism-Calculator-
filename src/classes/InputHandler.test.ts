// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputHandler } from "./InputHandler";

const MARKUP = `
  <button class="mode-toggle" data-setting="calculator-mode">type</button>
  <button class="mode-toggle" data-setting="appearance">look</button>
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

/** Handlers made by a test; key listeners live on the document, so each one is disposed afterwards. */
const created: InputHandler[] = [];
const createHandler = (root: ParentNode): InputHandler => {
  const handler = new InputHandler(root);
  created.push(handler);
  return handler;
};

describe("InputHandler", () => {
  let root: HTMLElement;
  let handler: InputHandler;

  afterEach(() => {
    for (const each of created.splice(0)) each.dispose();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    root = createRoot();
    handler = createHandler(root);
  });

  describe("registration", () => {
    const simpleBindings: Array<[string, keyof InputHandler, string]> = [
      ["calculator-type toggle", "onCalculatorModeToggle", '[data-setting="calculator-mode"]'],
      ["appearance toggle", "onAppearanceToggle", '[data-setting="appearance"]'],
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
        handler.onAppearanceToggle(vi.fn());
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
      const otherHandler = createHandler(otherRoot);
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
        calculatorModeToggle: vi.fn(),
        appearanceToggle: vi.fn(),
        clear: vi.fn(),
        decimal: vi.fn(),
        toggleSign: vi.fn(),
        percent: vi.fn(),
        equals: vi.fn(),
        number: vi.fn(),
        operator: vi.fn(),
      };
      handler.onCalculatorModeToggle(spies.calculatorModeToggle);
      handler.onAppearanceToggle(spies.appearanceToggle);
      handler.onClear(spies.clear);
      handler.onDecimal(spies.decimal);
      handler.onToggleSign(spies.toggleSign);
      handler.onPercent(spies.percent);
      handler.onEquals(spies.equals);
      handler.onNumber(spies.number);
      handler.onOperator(spies.operator);

      handler.dispose();

      for (const selector of [
        '[data-setting="calculator-mode"]',
        '[data-setting="appearance"]',
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
      const otherHandler = createHandler(root);
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
      handler.onAppearanceToggle(vi.fn());

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("does not affect a new handler created on the same root afterwards", () => {
      handler.onNumber(vi.fn());
      handler.dispose();

      const replacement = createHandler(root);
      const callback = vi.fn();
      replacement.onNumber(callback);
      click(root, '[data-number="7"]');

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("keyboard", () => {
    const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    };

    function bindAll() {
      const callbacks = {
        number: vi.fn(),
        operator: vi.fn(),
        decimal: vi.fn(),
        percent: vi.fn(),
        equals: vi.fn(),
        clear: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        toggleSign: vi.fn(),
      };
      handler.onNumber(callbacks.number);
      handler.onOperator(callbacks.operator);
      handler.onDecimal(callbacks.decimal);
      handler.onPercent(callbacks.percent);
      handler.onEquals(callbacks.equals);
      handler.onClear(callbacks.clear);
      handler.onOpenParenthesis(callbacks.open);
      handler.onCloseParenthesis(callbacks.close);
      handler.onToggleSign(callbacks.toggleSign);
      return callbacks;
    }

    it.each(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])("digit key %s passes that digit", (digit) => {
      const { number } = bindAll();
      press(digit);
      expect(number).toHaveBeenCalledExactlyOnceWith(digit);
    });

    it.each([
      ["+", "add"],
      ["-", "subtract"],
      ["*", "multiply"],
      ["/", "divide"],
    ])("operator key %s passes %s", (key, operator) => {
      const { operator: callback } = bindAll();
      press(key);
      expect(callback).toHaveBeenCalledExactlyOnceWith(operator);
    });

    it.each([
      [".", "decimal"],
      ["%", "percent"],
      ["Enter", "equals"],
      ["=", "equals"],
      ["Escape", "clear"],
      ["(", "open"],
      [")", "close"],
    ] as const)("key %s calls the %s callback", (key, name) => {
      const callbacks = bindAll();
      press(key);
      expect(callbacks[name]).toHaveBeenCalledTimes(1);
    });

    it("prevents the browser default of a handled key only", () => {
      bindAll();
      expect(press("/").defaultPrevented).toBe(true);
      expect(press("a").defaultPrevented).toBe(false);
    });

    it.each(["a", "s", "r", "^", "Tab", "Shift", "Backspace", "F5", " ", "ArrowLeft"])(
      "ignores the unmapped key %j (including the scientific keys)",
      (key) => {
        const callbacks = bindAll();
        press(key);
        for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
      },
    );

    it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])("ignores shortcuts with %o", (modifier) => {
      const callbacks = bindAll();
      const event = press("5", modifier);
      press("+", modifier);
      press("Enter", modifier);
      expect(event.defaultPrevented).toBe(false);
      for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    });

    it("allows Shift (needed for + * % ( ) on many layouts)", () => {
      const { operator } = bindAll();
      press("+", { shiftKey: true });
      expect(operator).toHaveBeenCalledTimes(1);
    });

    it("ignores auto-repeat, IME composition and events another handler already consumed", () => {
      const { number } = bindAll();
      press("5", { repeat: true });
      press("5", { isComposing: true });
      const consumed = new KeyboardEvent("keydown", { key: "5", bubbles: true, cancelable: true });
      consumed.preventDefault();
      document.body.dispatchEvent(consumed);
      expect(number).not.toHaveBeenCalled();
    });

    it.each(["input", "textarea", "select"])("does not take keys typed into a %s", (tag) => {
      const field = document.body.appendChild(document.createElement(tag));
      const { number, equals } = bindAll();

      const event = press("5", {}, field);
      press("Enter", {}, field);

      expect(event.defaultPrevented).toBe(false);
      expect(number).not.toHaveBeenCalled();
      expect(equals).not.toHaveBeenCalled();
    });

    it("does not take keys typed into an editable element", () => {
      const editable = document.body.appendChild(document.createElement("div"));
      editable.setAttribute("contenteditable", "true");
      const { number } = bindAll();
      press("5", {}, editable);
      expect(number).not.toHaveBeenCalled();
    });

    it("leaves Enter to a focused settings switch, but treats Enter on a keypad button as =", () => {
      const { equals } = bindAll();

      const onSwitch = press("Enter", {}, root.querySelector('[data-setting="appearance"]')!);
      expect(equals).not.toHaveBeenCalled();
      expect(onSwitch.defaultPrevented).toBe(false);

      const onKey = press("Enter", {}, root.querySelector('[data-number="7"]')!);
      expect(equals).toHaveBeenCalledTimes(1);
      expect(onKey.defaultPrevented).toBe(true);
    });

    it("lets every callback bound to the same key run", () => {
      const first = vi.fn();
      const second = vi.fn();
      handler.onClear(first);
      handler.onClear(second);
      press("Escape");
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("adds one keydown listener however many keys are bound", () => {
      const spy = vi.spyOn(document, "addEventListener");
      bindAll();
      expect(spy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
      spy.mockRestore();
    });

    it("keeps clicks working alongside keys", () => {
      const { clear, number } = bindAll();
      click(root, '[data-action="clear"]');
      click(root, '[data-number="7"]');
      press("Escape");
      press("7");
      expect(clear).toHaveBeenCalledTimes(2);
      expect(number.mock.calls).toEqual([["7"], ["7"]]);
    });

    it("stops handling keys after dispose()", () => {
      const callbacks = bindAll();
      handler.dispose();
      const event = press("5");
      press("Enter");
      expect(event.defaultPrevented).toBe(false);
      for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    });

    it("cannot bind keys after dispose()", () => {
      handler.dispose();
      const spy = vi.spyOn(document, "addEventListener");
      const callbacks = bindAll();
      press("5");
      expect(spy).not.toHaveBeenCalled();
      expect(callbacks.number).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("binds no key listener until a key callback is bound", () => {
      const spy = vi.spyOn(document, "addEventListener");
      handler.onAppearanceToggle(vi.fn());
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
