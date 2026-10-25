import type { Appearance } from "../themes/ThemeManager";
import type { CalculatorMode } from "./CalculatorModeSetting";
import { PreferenceStore } from "./PreferenceStore";

/** Only these two user choices are remembered; no expression, result, error or other calculator state. */
const CALCULATOR_MODE_KEY = "calculator.mode";
const APPEARANCE_KEY = "calculator.appearance";

const CALCULATOR_MODES: readonly CalculatorMode[] = ["normal", "pro"];
const APPEARANCES: readonly Appearance[] = ["light", "dark"];

/**
 * The remembered calculator type and appearance, each saved on its own so one never affects the other.
 * "Saved" getters return undefined when nothing valid is stored, so the settings keep their own defaults.
 */
export class UserPreferences {
  constructor(private readonly store: PreferenceStore = new PreferenceStore()) {}

  savedCalculatorMode(): CalculatorMode | undefined {
    return this.store.read(CALCULATOR_MODE_KEY, CALCULATOR_MODES) ?? undefined;
  }

  savedAppearance(): Appearance | undefined {
    return this.store.read(APPEARANCE_KEY, APPEARANCES) ?? undefined;
  }

  saveCalculatorMode(mode: CalculatorMode): void {
    this.store.write(CALCULATOR_MODE_KEY, mode);
  }

  saveAppearance(appearance: Appearance): void {
    this.store.write(APPEARANCE_KEY, appearance);
  }
}
