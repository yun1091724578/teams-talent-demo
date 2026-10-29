import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  defaultLocale, detectLocale, htmlLang, rememberLocale, setCurrentLocale, translate,
  type Locale, type MessageKey, type Vars,
} from '../../shared/i18n/index.ts';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: defaultLocale, setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());
  // Vendor templates and plain modules read the ambient locale.
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
