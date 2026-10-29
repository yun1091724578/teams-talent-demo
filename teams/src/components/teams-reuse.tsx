import type { ReactNode } from 'react';
import { Tag } from 'antd';
import { AppstoreOutlined, CodeOutlined } from '@ant-design/icons';
import { useT } from '../i18n.js';
/** FrameworkPreview WorkRow and quick-entry-grid presentation, adapted only
 * to demo rows. Source: framework/client/ui/src/views/framework-preview.tsx. */
export function TeamsWorkRow({ title, note, status, href, compact = false }: { title: string; note: string; status: string; href: string; compact?: boolean }) {
  const t = useT();
  return <a className={compact ? 'work-row compact-work-row' : 'work-row'} href={href}><span className="resource-icon"><CodeOutlined /></span><div><strong>{title}</strong><p>{note}</p></div><Tag color={status.includes('待') ? 'gold' : 'purple'}>{status}</Tag><span className="ui-note">{t('tr.view')}</span></a>;
}
export function TeamsQuickEntries({ entries }: { entries: { title: string; note: string; href: string }[] }) {
  return <div className="quick-entry-grid">{entries.map(entry => <a key={entry.href} href={entry.href}><span className="resource-icon"><AppstoreOutlined /></span><div><strong>{entry.title}</strong><p>{entry.note}</p></div></a>)}</div>;
}
export function TeamsPageIntro({ children, actions }: { children: ReactNode; extension?: string; actions?: ReactNode }) {
  return <div className="teams-page-intro"><span>{children}</span><div>{actions}</div></div>;
}
