// ================================================
// src/utils/storage.ts
// ================================================
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadMap(key: string): Map<string, string | null> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, string | null][]);
  } catch {
    return new Map();
  }
}

export function saveMap(key: string, map: Map<string, string | null>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
  } catch {
    /* ignore */
  }
}