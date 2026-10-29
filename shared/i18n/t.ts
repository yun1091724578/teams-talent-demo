// Message rendering: {name} interpolation and {count, plural, one{…} other{…}} only.
// Deliberately smaller than ICU: the app has ~80 templated strings and no nested selects.
import { catalogs, type MessageKey } from './messages/index.js';
import { currentLocale, htmlLang, type Locale } from './locale.js';

export type Vars = Record<string, string | number>;

const missing = new Set<string>();

/** Keys requested but absent from both catalogs. The CI gate asserts this stays empty. */
export const missingKeys = (): string[] => [...missing];

export function translate(locale: Locale, key: MessageKey, vars: Vars = {}): string {
  const template = catalogs[locale][key] ?? catalogs.zh[key];
  if (template === undefined) {
    if (!missing.has(key)) { missing.add(key); console.warn('i18n: missing key ' + key); }
    return key;
  }
  return renderTemplate(template, vars, locale);
}

export const translator = (locale: Locale) => (key: MessageKey, vars?: Vars) => translate(locale, key, vars);

/** Translate in the ambient locale; for modules that cannot use the React hook. */
export const currentT = (key: MessageKey, vars?: Vars): string => translate(currentLocale(), key, vars);

function renderTemplate(template: string, vars: Vars, locale: Locale): string {
  let out = '';
  let index = 0;
  while (index < template.length) {
    const open = template.indexOf('{', index);
    if (open < 0) { out += template.slice(index); break; }
    out += template.slice(index, open);
    const close = matchingBrace(template, open);
    if (close < 0) { out += template.slice(open); break; }
    out += renderExpression(template.slice(open + 1, close), vars, locale);
    index = close + 1;
  }
  return out;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

const PLURAL = /^(\w+),\s*plural,\s*([\s\S]+)$/;
const BRANCH = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;

function renderExpression(expression: string, vars: Vars, locale: Locale): string {
  const expr = expression.trim();
  const plural = PLURAL.exec(expr);
  if (!plural) {
    const value = vars[expr];
    return value === undefined ? `{${expr}}` : String(value);
  }
  const count = Number(vars[plural[1]] ?? 0);
  const branches: Record<string, string> = {};
  for (const match of plural[2].matchAll(BRANCH)) branches[match[1]] = match[2];
  const selected = new Intl.PluralRules(htmlLang(locale)).select(count);
  const body = branches['=' + count] ?? branches[selected] ?? branches.other ?? '';
  return body.replaceAll('#', String(count));
}
