/** The part of the Web Storage API the preferences need. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null where it does not exist or may not be touched (blocked, private mode). */
function browserStorage(): PreferenceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Remembers small user preferences as plain strings. It never throws: storage that is missing, blocked,
 * full or holding an unexpected value just means "nothing remembered", so the caller falls back to its default.
 * It knows nothing about calculators, themes or the DOM.
 */
export class PreferenceStore {
  constructor(private readonly storage: PreferenceStorage | null = browserStorage()) {}

  /** The stored value, but only if it is one of `allowed`; otherwise null. */
  read<T extends string>(key: string, allowed: readonly T[]): T | null {
    try {
      const stored = this.storage?.getItem(key);
      return allowed.find((value) => value === stored) ?? null;
    } catch {
      return null; // reading was refused: behave as if nothing was saved
    }
  }

  write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // saving was refused or the storage is full: the preference simply lasts until the page closes
    }
  }
}
