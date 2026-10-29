import { displayText } from '../display-text.js';
import { useState } from 'react';
import { Button, Collapse, Drawer, Empty, Input, Modal, Space, Switch, Tabs, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { EnterpriseSourceData } from '../components/enterprise-source-data.js';
import { enterpriseBrands, EnterprisePlatformBrand } from '../components/enterprise-platform-brand.js';
import { Origin } from '../components/common.js';
import { TeamsPageIntro } from '../components/teams-reuse.js';
import { externalPlatforms, externalPlatformDefault } from '../external-platforms.js';
import type { WorkspaceState } from '../workspace.js';
import '../operations.css';
import '../enterprise-connections.css';

type Connection = WorkspaceState['connections'][number];
type PlatformRow = Connection & { pluginId: keyof typeof enterpriseBrands; platform: string; summary: string; dataTypes: readonly string[] };
const configurationTabKeys = { quality: 'org.tab.quality', services: 'org.tab.services' } as const;
const configurationTabOrder = Object.keys(configurationTabKeys) as (keyof typeof configurationTabKeys)[];
/** The upstream enterprise-connection route currently supplies CapabilityState.
 * Keep its route vocabulary and port the existing resource-card/header/meta/footer
 * structure from agent-resources/src/client/ui/index.ts. Platform cards are demo adapters. */
export function Organization() {
  const { state, role, update, busy, navigate } = useDemo();
  const t = useT();
  const configurationTabs = configurationTabOrder.map(key => ({ key, label: t(configurationTabKeys[key]) }));
  const legacyTab = new URLSearchParams(location.hash.split('?')[1]).get('tab');
  const [configurationOpen, setConfigurationOpen] = useState(configurationTabs.some(item => item.key === legacyTab));
  const [configurationTab, setConfigurationTab] = useState(legacyTab && configurationTabs.some(item => item.key === legacyTab) ? legacyTab : 'quality');
  const [sourcePlatform, setSourcePlatform] = useState<(typeof externalPlatforms)[number] | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null), [description, setDescription] = useState(''), [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState('');
  const rows: PlatformRow[] = externalPlatforms.map(source => ({ ...externalPlatformDefault(source.id)!, ...state.workspace.connections.find(item => item.id === ('connectionId' in source ? source.connectionId : source.id)), pluginId: source.id, platform: source.name, summary: source.description, dataTypes: source.dataTypes }));
  const filteredRows = rows.filter(item => [item.platform, enterpriseBrands[item.pluginId].name, item.summary, item.description, ...item.dataTypes].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const configs = state.workspace.connections.filter(item => configurationTab === 'quality' ? item.kind === 'quality' : configurationTab === 'services' ? ['model','tool'].includes(item.kind) : item.kind === 'talent');
  const edit = (item: Connection) => { setEditing(item); setDescription(displayText(item.description)); setEnabled(item.enabled); };
  return <div className="page-stack enterprise-connections">
    <TeamsPageIntro actions={<Space wrap><Button size="small" onClick={() => setConfigurationOpen(true)}>{t('org.advanced')}</Button></Space>}>{t('org.intro')}</TeamsPageIntro>
    <div className="connection-search"><Input.Search aria-label={t('org.searchAria')} placeholder={t('org.searchPlaceholder')} allowClear value={query} onChange={event => setQuery(event.target.value)} /><span className="ui-note">{t('org.connectionCount', { count: filteredRows.length })}</span></div>
    <section className="enterprise-plugin-grid" aria-label={t('org.platformsAria')}>{filteredRows.map(item => <article key={item.id} data-platform={item.pluginId} className="resource-card enterprise-plugin-card">
      <div className="resource-heading"><EnterprisePlatformBrand id={item.pluginId} /><div><h3>{item.platform}</h3><div className="enterprise-platform-name">{enterpriseBrands[item.pluginId].name}</div><p>{item.summary}</p></div></div>
      <div className="enterprise-plugin-data"><span className="ui-note">{t('org.provides')}</span><Space size={4} wrap>{item.dataTypes.map(type => <Tag key={type}>{type}</Tag>)}</Space></div>
      <div className="enterprise-plugin-scope"><span className="ui-note">{t('org.scope', { team: state.workspace.team.name })}</span>{item.description !== item.summary && <p>{displayText(item.description)}</p>}</div>
      <footer><Tag color={item.enabled ? 'blue' : undefined}>{item.enabled ? t('org.configured') : t('org.disabled')}</Tag><Space size={4} wrap>{role === 'owner' && <Button size="small" aria-label={t('org.configureAria', { name: item.platform })} onClick={() => edit({ ...item, name: item.platform })}>{t('org.configure')}</Button>}<Button size="small" aria-label={t('org.viewDataAria', { name: item.platform })} onClick={() => setSourcePlatform(externalPlatforms.find(platform => platform.id === item.pluginId)!)}>{t('org.viewData')}</Button><Button type="text" size="small" disabled={!item.enabled} onClick={() => navigate('projects?tab=content')}>{t('org.useInProject')}</Button></Space></footer>
    </article>)}</section>{!filteredRows.length && <Empty description={t('org.noMatch')}><Button onClick={() => setQuery('')}>{t('org.clearSearch')}</Button></Empty>}
    {sourcePlatform && <EnterpriseSourceData platform={sourcePlatform} onClose={() => setSourcePlatform(null)} />}
    <Drawer title={t('org.advanced')} width={680} open={configurationOpen} onClose={() => setConfigurationOpen(false)}><p className="ui-note">{t('org.drawerNote')}</p><Tabs activeKey={configurationTab} onChange={setConfigurationTab} items={configurationTabs} /><div className="page-stack">{configs.map(item => <FrameworkCard key={item.id} title={item.name} action={<Switch aria-label={t('org.enableAria', { name: item.name })} checked={item.enabled} disabled={role !== 'owner' || busy} onChange={value => void update('connection.update', { id: item.id, enabled: value, description: item.description })} />}><p>{displayText(item.description)}</p><Button size="small" disabled={role !== 'owner'} onClick={() => edit(item)}>{t('org.editConfig')}</Button></FrameworkCard>)}</div></Drawer>
    <Modal title={t('org.configureTitle', { name: editing?.name ?? '' })} open={!!editing} onCancel={() => setEditing(null)} okText={t('org.saveConfig')} cancelText={t('common.cancel')} confirmLoading={busy} okButtonProps={{ disabled: !description.trim() }} onOk={async () => { if (!editing) return; const saved = await update('connection.update', { id: editing.id, enabled, description: description.trim() }); if (saved) setEditing(null); }}><p>{t('org.scopeLabel', { team: state.workspace.team.name })}</p><div className="ops-config-label">{t('org.enableCapability')}</div><Switch aria-label={t('org.enableStateAria')} checked={enabled} onChange={setEnabled} /><Collapse className="connection-advanced" ghost items={[{ key: 'scope', label: t('org.advancedScope'), children: <Input.TextArea aria-label={t('org.scopeNote')} value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={1500} showCount /> }]} /><p className="ui-note">{t('org.saveNote')}</p></Modal>
  </div>;
}
