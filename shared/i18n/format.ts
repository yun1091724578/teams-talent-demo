// Every date, number and currency shown by the app goes through these, so a locale
// switch cannot leave a stray zh-CN format behind.
import { htmlLang, type Locale } from './locale.js';

type Input = Date | string | number;
const toDate = (value: Input): Date => (value instanceof Date ? value : new Date(value));
const tag = (locale: Locale) => htmlLang(locale);

export const fmtDate = (locale: Locale, value: Input, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(tag(locale), options ?? { year: 'numeric', month: '2-digit', day: '2-digit' }).format(toDate(value));

export const fmtDateTime = (locale: Locale, value: Input, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(tag(locale), options ?? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(value));

export const fmtTime = (locale: Locale, value: Input): string =>
  new Intl.DateTimeFormat(tag(locale), { hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(value));

export const fmtNumber = (locale: Locale, value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(tag(locale), options).format(value);

/** 1.2万 in zh, 12K in en: replaces both the K/M helper and the hardcoded ' 万'. */
export const fmtCompact = (locale: Locale, value: number): string =>
  new Intl.NumberFormat(tag(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const fmtPercent = (locale: Locale, ratio: number, digits = 0): string =>
  new Intl.NumberFormat(tag(locale), { style: 'percent', maximumFractionDigits: digits }).format(ratio);

/** Amounts are stored as integer cents; only presentation converts. */
export const fmtCurrency = (locale: Locale, cents: number, currency = 'CNY'): string =>
  new Intl.NumberFormat(tag(locale), { style: 'currency', currency }).format(cents / 100);

export function fmtRelative(locale: Locale, value: Input, base: Input = Date.now()): string {
  const seconds = Math.round((toDate(value).getTime() - toDate(base).getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  return formatter.format(seconds, 'second');
}
