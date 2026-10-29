import type { Role } from './domain.js';
import type { PageDefinition } from './vendor/teams/page-registry.js';
import type { MessageKey } from '../../shared/i18n/index.js';

type KeyedPage = Omit<PageDefinition, 'title'> & { titleKey: MessageKey };

const common: KeyedPage[] = [
  { id: 'home', route: 'home', titleKey: 'nav.home', groupId: 'personal', icon: 'home' },
  { id: 'agent', route: 'agent', titleKey: 'nav.agent', groupId: 'personal', icon: 'agent' },
  { id: 'projects', route: 'projects', titleKey: 'nav.projects', groupId: 'team', icon: 'projects' },
  { id: 'team', route: 'team', titleKey: 'nav.team', groupId: 'team', icon: 'members' },
  { id: 'team-work', route: 'team-work', titleKey: 'nav.teamWork', groupId: 'team', icon: 'insights' },
  { id: 'resources', route: 'resources', titleKey: 'nav.resources', groupId: 'shared', icon: 'appstore' },
  { id: 'subscriptions', route: 'subscriptions', titleKey: 'nav.subscriptions', groupId: 'shared', icon: 'subscriptions' },
  { id: 'publications', route: 'publications', titleKey: 'nav.publications', groupId: 'shared', icon: 'publications' },
  { id: 'talent', route: 'talent', titleKey: 'nav.talents', groupId: 'custom', icon: 'appstore' },
];
const connections: KeyedPage = { id: 'connections', route: 'connections', titleKey: 'nav.connections', groupId: 'team', icon: 'appstore' };

export function teamsPages(role: Role, t: (key: MessageKey) => string): PageDefinition[] {
  const list = role === 'member' ? common.filter(p => p.id !== 'talent') : [...common.slice(0, 4), connections, ...common.slice(4)];
  return list.map(({ titleKey, ...page }) => ({ ...page, title: t(titleKey) }));
}
export const isOwnerPage = (path: string) => ['connections', 'organization', 'talent'].includes(path);
