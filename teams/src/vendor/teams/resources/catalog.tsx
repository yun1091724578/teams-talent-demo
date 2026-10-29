import type { ReactNode } from 'react';
import { Button } from 'antd';
import { vt } from '../i18n.js';
/** React presentation port of agent-resources/src/client/ui/index.ts:
 * resourceMeta, gridCard, listRow (lines 256–288), card/renderLocal (584–664).
 * Keep the upstream DOM hierarchy; callers provide demo data and commands. */
export interface ResourceEntry { id: string; name: string; description: string; category: 'skill' | 'agent'; version: string; owner: string; scope: string; tool: string; selected: boolean; availability?: string }
export function ResourceMeta({ item }: { item: ResourceEntry }) {
  return <p className="resource-meta"><span className="resource-badge">{item.category === 'skill' ? 'Skill' : 'Agent'}</span><span>{item.version}</span><span className="resource-badge resource-badge-scope">{item.scope}</span><span className="resource-owner">{item.owner}</span></p>;
}
export function ResourceCatalogEntry({ item, view, details, action }: { item: ResourceEntry; view: 'grid' | 'list'; details: () => void; action: ReactNode }) {
  const icon = <span className="resource-icon" aria-hidden>{item.category === 'skill' ? '</>' : '🤖'}</span>;
  if (view === 'list') return <article className="resource-row">{icon}<div className="resource-row-name"><strong title={item.name}>{item.name}</strong><p className="resource-description">{item.description}</p></div><ResourceMeta item={item} /><Button onClick={details}>{vt('res.viewDetail')}</Button>{action}</article>;
  return <article className="resource-card"><div className="resource-heading">{icon}<div><h3 title={item.name}>{item.name}</h3></div></div><p className="resource-description">{item.description}</p><ResourceMeta item={item} /><footer><span className="ui-note">{item.availability ?? (item.selected ? vt('res.card.selected') : vt('res.card.local'))}</span><Button onClick={details}>{vt('res.viewDetail')}</Button>{action}</footer></article>;
}
export function ResourceLibraryEntry({ item, meta, actions }: { item: ResourceEntry; meta: string; actions: ReactNode }) {
  return <article className="resource-library-entry"><h3>{item.name}</h3><p className="ui-note">{meta}</p><div className="resource-actions">{actions}</div></article>;
}
