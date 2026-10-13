export function readStorage(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function writeStorage(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; } catch { return false; }
}
export function readLanguage() { return readStorage('app_lang') === 'en' ? 'en' : 'zh'; }
