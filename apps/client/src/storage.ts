/**
 * Web storage that never throws (private windows and blocked storage just forget).
 * `session` storage is per tab and survives reloads; `local` is shared by all tabs.
 */
type Kind = 'local' | 'session';

const store = (kind: Kind): Storage => (kind === 'local' ? localStorage : sessionStorage);

export function load<T>(key: string, kind: Kind = 'local'): T | null {
  try {
    const raw = store(kind).getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown, kind: Kind = 'local'): void {
  try {
    store(kind).setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here; the game works without it.
  }
}

export function remove(key: string, kind: Kind = 'local'): void {
  try {
    store(kind).removeItem(key);
  } catch {
    // Same as above.
  }
}
