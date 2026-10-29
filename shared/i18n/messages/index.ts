import { en } from './en.js';
import { zh } from './zh.js';
import type { Locale } from '../locale.js';

export type MessageKey = keyof typeof zh;
export const catalogs: Record<Locale, Record<MessageKey, string>> = { zh, en };
