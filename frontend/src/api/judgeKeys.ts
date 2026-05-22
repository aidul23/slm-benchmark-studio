/**
 * Per-provider API key storage.
 *
 * Keys live in `sessionStorage`, which:
 *   - is scoped to the current browser tab,
 *   - is cleared when the tab is closed,
 *   - is NOT shared across tabs or sent over the network.
 *
 * The backend never persists keys either: they travel only in request bodies
 * over localhost, and we never log them. If a user wants stronger guarantees
 * they can simply close the tab — the key is wiped.
 */

const PREFIX = "slm-benchmark-studio:judge-key:";

function key(provider: string): string {
  return `${PREFIX}${provider}`;
}

export function getJudgeKey(provider: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key(provider)) ?? "";
  } catch {
    return "";
  }
}

export function setJudgeKey(provider: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.sessionStorage.setItem(key(provider), value);
    } else {
      window.sessionStorage.removeItem(key(provider));
    }
  } catch {
    // Storage may be disabled (private windows etc.); silently ignore.
  }
}

export function clearJudgeKey(provider: string): void {
  setJudgeKey(provider, "");
}

export function clearAllJudgeKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const remove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) remove.push(k);
    }
    for (const k of remove) window.sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}
