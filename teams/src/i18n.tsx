import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setCurrentLocale } from '../../shared/i18n/index.js';
import {
  defaultLocale, detectLocale, htmlLang, isLocale, rememberLocale, translate,
  type Locale, type MessageKey, type Vars,
} from '../../shared/i18n/index.js';

/** The service can set a deployment default; query, storage and browser still win over it. */
function injectedDefaultLocale(): Locale | undefined {
  const text = document.getElementById('demo-system-runtime')?.textContent;
  if (!text) return undefined;
  try { const value = JSON.parse(text); return isLocale(value.defaultLocale) ? value.defaultLocale : undefined; } catch { return undefined; }
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: defaultLocale, setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale(injectedDefaultLocale()));
  // Non-React modules (task projections, vendor templates) read the ambient locale.
  setCurrentLocale(locale);
  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    rememberLocale(locale);
  }, [locale]);
  // Keep ?lang= in step, otherwise a reload would restore the previous choice.
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): LocaleContextValue => useContext(LocaleContext);

export function useT() {
  const { locale } = useLocale();
  return useMemo(() => (key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
}
