/** Presentation-only labels. Never apply to protocol values, paths, hashes, or source/Skill text. */
import { currentT, type MessageKey } from '../../shared/i18n/index.js';
import { knownServerNote } from './task-labels-en.js';

/**
 * What the service says about a node's selected inputs. The service sends prose for other cases;
 * the two it produces most often are rebuilt here so they follow the UI language.
 */
export function selectionNote(selection: { status: string; note: string } | undefined): string | undefined {
  if (!selection) return undefined;
  if (selection.status === 'configured') return currentT('sel.configured');
  if (selection.status === 'not-configured') return currentT('sel.notConfigured');
  return selection.note;
}
/** Session streams carry a fixed explanatory note from the service; rebuild it so it follows the UI language. */
export function streamNote(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const key = knownServerNote(text);
  return key ? currentT(key as MessageKey) : text;
}
export function displayRequirementId(value: string): string {
  return value.replace(/\bDEMO-MKT-001\b/g, 'MKT-001');
}
/** Use explicitly on product metadata or saved UI messages; source bodies stay untouched. */
export function displayText(value: string): string {
  return displayRequirementId(value)
    .replace(/（(?:演示|模拟|样例|示例)）|\((?:demo|mock)\)/gi, '')
    .replace(/(?:演示|模拟)(?:数据|记录)/g, '记录')
    .replace(/演示工程/g, '工作区').replace(/演示服务/g, '服务').replace(/演示角色/g, '角色')
    .replace(/演示配置/g, '配置').replace(/演示项目/g, '项目').replace(/演示流程/g, '流程')
    .replace(/演示日/g, '当日').replace(/演示接入/g, '本地接入')
    .replace(/演示示例|演示样例|接入示例|接入样例/g, '配置参考')
    .replace(/演示|模拟/g, '')
    .replace(/(?<![\w/.:-])(?:mock|demo)(?![\w/.:-])\s*/gi, '')
    .replace(/样例|示例/g, '参考')
    .replace(/ {2,}/g, ' ').trim();
}

/** Upgrade only the former default project description in the view; saved/custom text stays untouched. */
export function displayProjectDescription(value: string): string {
  return value === '基于存量 CardDemo 系统交付餐饮返现能力，形成可追溯的项目知识与研发经验。' ? '针对白金卡客户未来 3 个月的消费，额外增加 0.5% 的消费返现。' : value;
}
