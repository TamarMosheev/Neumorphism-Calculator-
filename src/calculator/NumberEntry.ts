/**
 * Rules for typing a number one key at a time. Pure functions over the text typed so far;
 * an empty string means "a new number is starting". No imports, so any calculator can reuse them.
 */

/** Longest number the user can type; every such number is exactly representable as a double. */
export const MAX_ENTRY_DIGITS = 15;

/** Digits in a typed number; the sign and the decimal point do not count. */
export function countDigits(text: string): number {
  return text.replace(/\D/g, "").length;
}

/** The text after typing `digit`, or null when the key is ignored (not a digit, or the digit limit is reached). */
export function appendDigit(text: string, digit: string): string | null {
  if (!/^[0-9]$/.test(digit)) return null;
  if (countDigits(text) >= MAX_ENTRY_DIGITS) return null;

  // No leading zeros: a lone 0 is replaced by the next digit.
  return text === "" || text === "0" ? digit : text + digit;
}

/** The text after typing the decimal point, or null when the number already has one. A new number starts as "0.". */
export function appendDecimal(text: string): string | null {
  if (text === "") return "0.";

  return text.includes(".") ? null : `${text}.`;
}

/** Flips the sign of typed text and keeps its formatting ("5." -> "-5.", "2.00" -> "-2.00"). */
export function negateText(text: string): string {
  return text.startsWith("-") ? text.slice(1) : `-${text}`;
}
