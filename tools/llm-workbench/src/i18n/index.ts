import { useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale } from './store';
import { resources, type ResourceKey } from './resources';

export type { Locale } from './store';
export type { ResourceKey, Resources } from './resources';

// Translate a key for the active locale. Missing keys fall back to the raw key
// (so a typo or an untranslated string still renders something visible).
// Params use {name} placeholders, e.g. t('app.sources', { a: 3, b: 5 }).
export function t(key: ResourceKey, params?: Record<string, string | number>): string {
  const dict = resources[getLocale()] as Record<string, string>;
  let str: string = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.split(`{${name}}`).join(String(value));
    }
  }
  return str;
}

// Subscribe a component to locale changes. Returns a stable t() and setLocale();
// only `locale` changes between renders, so re-renders are scoped to language switches.
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return { locale, setLocale, t };
}
