// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/**
 * Documents the platform behaviour InputHandler.dispose() and CalculatorUI.dispose() rely on:
 * a listener added with an AbortSignal is removed when that signal aborts.
 *
 * It deliberately does NOT rely on the opposite case (adding a listener with an already-aborted
 * signal): vitest's jsdom environment still runs such a listener, although browsers ignore it.
 * InputHandler therefore checks `signal.aborted` itself.
 */
describe("AbortSignal listener cleanup (platform behaviour)", () => {
  it("removes a listener when its signal aborts", () => {
    const controller = new AbortController();
    const button = document.createElement("button");
    let calls = 0;
    button.addEventListener("click", () => calls++, { signal: controller.signal });

    button.click();
    controller.abort();
    button.click();

    expect(calls).toBe(1);
  });

  it("removes every listener registered with the same signal at once", () => {
    const controller = new AbortController();
    const button = document.createElement("button");
    let calls = 0;
    for (let index = 0; index < 5; index++) {
      button.addEventListener("click", () => calls++, { signal: controller.signal });
    }

    controller.abort();
    button.click();

    expect(calls).toBe(0);
  });

  it("works for window listeners too", () => {
    const controller = new AbortController();
    let calls = 0;
    window.addEventListener("resize", () => calls++, { signal: controller.signal });

    window.dispatchEvent(new Event("resize"));
    controller.abort();
    window.dispatchEvent(new Event("resize"));

    expect(calls).toBe(1);
  });
});
