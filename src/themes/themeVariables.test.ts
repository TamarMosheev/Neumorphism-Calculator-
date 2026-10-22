import { describe, expect, it } from "vitest";
import css from "../styles/style.css?raw";

function variablesIn(selector: RegExp): string[] {
  const block = selector.exec(css)?.[1] ?? "";
  return [...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);
}

describe("theme CSS variables", () => {
  const light = variablesIn(/:root\s*\{([^}]*)\}/);
  const pro = variablesIn(/body\.theme-pro\s*\{([^}]*)\}/);

  it("defines both themes", () => {
    expect(light.length).toBeGreaterThan(0);
    expect(pro.length).toBeGreaterThan(0);
  });

  it("lets PRO MODE override only variables NORMAL MODE defines", () => {
    expect(light).toEqual(expect.arrayContaining(pro));
  });

  it("gives PRO MODE a value for every themed variable (only the transition timing is shared)", () => {
    const sharedOnly = light.filter((name) => !pro.includes(name));
    expect(sharedOnly).toEqual(["--theme-duration"]);
  });
});
