// Locale store: a module-level singleton consumed via useSyncExternalStore.
// No React context provider needed, so any component can call useI18n() directly.

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'wb-locale';

function initialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'zh' || v === 'en') return v;
  }
  return 'zh';
}

let current: Locale = initialLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, locale);
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
