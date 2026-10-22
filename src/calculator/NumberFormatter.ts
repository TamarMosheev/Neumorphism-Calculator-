/**
 * Display formatting only. Values are never rounded here for later calculation:
 * the engine keeps the full-precision number and calls this just to render it.
 */

/** A double holds 15 significant decimal digits reliably, so display never claims more. */
const DISPLAY_SIGNIFICANT_DIGITS = 15;

/**
 * Integers up to this size are represented exactly by a double.
 * Beyond it, neighbouring integers are indistinguishable, so exact-looking digits would be misleading.
 */
const MAX_EXACT_INTEGER = Number.MAX_SAFE_INTEGER;

export function formatNumber(value: number): string {
  const magnitude = Math.abs(value);

  if (Number.isInteger(value) && magnitude <= MAX_EXACT_INTEGER) {
    return String(value);
  }

  if (magnitude > MAX_EXACT_INTEGER) {
    return toTrimmedExponential(value);
  }

  // Removes binary floating-point noise (0.1 + 0.2 -> 0.3) without touching the stored value.
  return String(Number(value.toPrecision(DISPLAY_SIGNIFICANT_DIGITS)));
}

/** 99999999980000000000 -> "9.999999998e+19": approximate magnitudes are not shown as exact digits. */
function toTrimmedExponential(value: number): string {
  return value.toExponential(DISPLAY_SIGNIFICANT_DIGITS - 1).replace(/\.?0+e/, "e");
}
