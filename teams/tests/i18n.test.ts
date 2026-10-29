import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, missingKeys, fmtCompact, fmtCurrency, fmtDate } from '../../shared/i18n/index.js';
import type { MessageKey } from '../../shared/i18n/index.js';

test('catalog covers both languages with the same keys', () => {
  assert.equal(translate('zh', 'nav.home'), '工作台');
  assert.equal(translate('en', 'nav.home'), 'Workspace');
});

test('interpolates named variables', () => {
  // Chinese marks completion with a result complement; English folds it into the past-tense label.
  assert.equal(translate('zh', 'action.completed', { name: '分配' }), '分配已完成');
  assert.equal(translate('en', 'action.completed', { name: 'Requirement assigned' }), 'Requirement assigned');
});

test('plural picks the language rule', () => {
  assert.equal(translate('en', 'common.count', { count: 1 }), '1 item');
  assert.equal(translate('en', 'common.count', { count: 3 }), '3 items');
  assert.equal(translate('zh', 'common.count', { count: 3 }), '3 项');
});

test('unknown keys fall back to the key and are reported', () => {
  const key = 'missing.key' as MessageKey;
  assert.equal(translate('en', key), 'missing.key');
  assert.ok(missingKeys().includes(key));
});

test('formatting follows the locale', () => {
  assert.equal(fmtCompact('zh', 12000), '1.2万');
  assert.equal(fmtCompact('en', 12000), '12K');
  assert.notEqual(fmtDate('zh', '2026-10-29'), fmtDate('en', '2026-10-29'));
  assert.match(fmtCurrency('en', 1200), /12\.00/);
});
