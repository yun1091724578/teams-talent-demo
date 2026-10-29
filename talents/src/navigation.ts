// Owner workspace: sources, knowledge tasks and artifacts.
import type { PageDefinition } from './vendor/teams/page-registry.ts';
import { currentT, type MessageKey } from '../../shared/i18n/index.ts';
import type { Role } from './types.ts';

export interface TalentsPage extends PageDefinition { role: Role }
// Titles and tab labels are chrome: getters keep `page.title` working while reading the current locale.
const pageTitleKeys: Record<string, MessageKey> = { team: 'tnav.team', projects: 'tnav.projects', capabilities: 'tnav.capabilities', overview: 'tnav.overview', account: 'tnav.account' };
const withTitle = (page: Omit<TalentsPage, 'title'>): TalentsPage => Object.defineProperties({ ...page } as TalentsPage, {
  title: { get: () => currentT(pageTitleKeys[page.id]), enumerable: true },
});
export const pages: TalentsPage[] = [
  withTitle({ id: 'team', route: 'team', role: 'admin', groupId: 'team', icon: 'members' }),
  withTitle({ id: 'projects', route: 'projects', role: 'admin', groupId: 'team', icon: 'projects' }),
  withTitle({ id: 'capabilities', route: 'capabilities', role: 'admin', groupId: 'team', icon: 'appstore' }),
  // Without a group the sidebar does not list them: the overview opens from the topbar's book icon, the account page from the avatar.
  withTitle({ id: 'overview', route: 'overview', role: 'admin' }),
  withTitle({ id: 'account', route: 'account', role: 'admin' }),
];
export const home: Record<Role, string> = { admin: 'projects', dev: 'projects' };

const tabKeys = { review: 'tnav.tabReview', tasks: 'tnav.tabTasks', sources: 'tnav.tabSources' } as const;
export const levelTabs = (['review', 'tasks', 'sources'] as const).map(key => Object.defineProperties({ key } as { key: typeof key; label: string }, {
  label: { get: () => currentT(tabKeys[key]), enumerable: true },
}));
export type LevelTab = typeof levelTabs[number]['key'];
/** A tab of a level: #/projects?project=<id>&tab=<tab>, or #/team?tab=<tab> for the team; extra parameters follow. */
export function levelHash(pid: string | null, tab: LevelTab = 'review', extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ ...(pid ? { project: pid } : {}), ...(tab === 'review' ? {} : { tab }), ...extra }).toString();
  return '#/' + (pid ? 'projects' : 'team') + (query ? '?' + query : '');
}

export interface Route { page: TalentsPage; params: Record<string, string> }
/** #/<page>?<params>; an unknown page is null and the caller falls back to the entry's home.
 *  Teams links to #/review?project=<id> and #/tasks?project=<id>: a tab name opens that tab of the project. */
export function parseHash(hash: string): { page: TalentsPage | null; params: Record<string, string> } {
  const [name, query] = hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (levelTabs.some(t => t.key === name)) return { page: pages.find(p => p.id === (params.project ? 'projects' : 'team'))!, params: { ...params, tab: name } };
  if (['knowledge', 'dev-knowledge', 'local'].includes(name)) return { page: pages.find(p => p.id === 'projects')!, params };
  const id = name;
  return { page: pages.find(p => p.id === id) ?? null, params };
}
