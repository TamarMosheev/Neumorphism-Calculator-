import { defineConfig } from "vitest/config";

// Test-only config; the app build (vite build) does not read this file.
export default defineConfig({
  test: {
    // Lets tests read src/styles/style.css as text (vitest blanks CSS imports by default).
    css: true,
  },
});
