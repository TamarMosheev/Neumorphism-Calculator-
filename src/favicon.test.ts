import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import favicon from "../public/favicon.svg?raw";

describe("favicon", () => {
  it("is linked from the page as an SVG icon at the site root, so it works in development and in the build", () => {
    expect(indexHtml).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
  });

  it("is declared in the head", () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(indexHtml)?.[1] ?? "";

    expect(head).toContain('href="/favicon.svg"');
  });

  it("is a self-contained SVG using the calculator's blue accent, with no scripts or external references", () => {
    expect(favicon).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(favicon).toContain('viewBox="0 0 64 64"');
    expect(favicon).toContain("#6f9bf5");
    expect(favicon).toContain("#4f7fe0");
    expect(favicon).not.toMatch(/<script|href=|<image|javascript:/i);
  });

  it("the icon blue is the equals button's gradient", async () => {
    const styles = (await import("./styles/style.css?raw")).default;

    expect(styles.toLowerCase()).toMatch(/6f9bf5|111,\s*155,\s*245/);
  });
});
