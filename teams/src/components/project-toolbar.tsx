import type { ReactNode } from 'react';
import { Tabs } from 'antd';
import { useT } from '../i18n.js';
import '../project.css';

export const projectPages = [
  { key: 'content', labelKey: 'pp.overview' },
  { key: 'management', labelKey: 'pp.management' },
  { key: 'delivery', labelKey: 'pp.delivery' },
] as const;

export function ProjectToolbar({ activeKey, onChange, actions }: { activeKey: string; onChange(value: string): void; actions: ReactNode }) {
  const t = useT();
  return <div className="project-toolbar" role="region" aria-label={t('pp.toolbarAria')}>
    <Tabs aria-label={t('pp.phasesAria')} activeKey={activeKey} onChange={onChange} items={projectPages.map(page => ({ key: page.key, label: t(page.labelKey) }))} />
    <div className="project-toolbar-actions">{actions}</div>
  </div>;
}
