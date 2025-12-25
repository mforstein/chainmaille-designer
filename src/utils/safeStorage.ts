// src/utils/safeStorage.ts
export const safeStorage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch {}
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch {}
  },
  available(): boolean {
    try {
      const k = "__storage_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
};