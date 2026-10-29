import { displayRequirementId, displayText } from '../display-text.js';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT } from '../../../shared/i18n/index.js';
import { createSourcePluginCatalog, sourceAssetKindLabels, type SourcePluginAsset } from '../source-plugins.js';
import { legacyAssetSourceIds } from '../project-asset-links.js';
import type { Asset } from '../workspace.js';
import { externalPlatforms } from '../external-platforms.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { Mono } from './common.js';

interface AssetRow { id: string; title: string; kind: string; location: string; source?: SourcePluginAsset; local?: Asset }
// Source-plugin kind names stay on the zh vocabulary owned by source-plugins; the demo-only
// extra kind resolves through the ambient locale.
const kinds = Object.defineProperties({ ...sourceAssetKindLabels } as Record<string, string>, {
  other: { get: () => currentT('pa.kind.other'), enumerable: true },
});

export function ProjectAssets({ projectId, extra }: { projectId: string; extra?: ReactNode }) {
  const { state, data, role, busy, update, showText, showEvidence } = useDemo();
  const t = useT();
  const catalog = useMemo(() => createSourcePluginCatalog(data), [data]);
  const [open, setOpen] = useState(false), [mode, setMode] = useState('plugin'), [plugin, setPlugin] = useState('all'), [selected, setSelected] = useState<string>(), [failed, setFailed] = useState(false);
  const [form] = Form.useForm();
  const readOnly = projectId === 'teams', canWrite = role === 'owner' && !readOnly;
  const local = projectId === 'carddemo' ? state.workspace.project.assets : state.workspace.projects?.find(project => project.id === projectId)?.assets ?? [];
  const rowFromSource = (source: SourcePluginAsset): AssetRow => ({ id: source.id, title: displayText(source.title), kind: source.kind, location: source.references.map(reference => reference.path).join(' · ') || displayRequirementId(source.sourceRecordId), source });
  const rows: AssetRow[] = readOnly
    ? ['repository:teams:icode-teams', ...data.teamsProject.project.docs.map(doc => 'design-library:teams:' + doc.path)].map(id => { const source = catalog.get(id); if (!source) throw new Error(t('pa.sourceMissing', { id })); return rowFromSource(source); })
    : local.flatMap(asset => {
      const ids = projectId === 'carddemo' ? legacyAssetSourceIds(asset) : asset.sourceAssetId ? [asset.sourceAssetId] : [];
      return ids.length ? ids.map(id => { const source = catalog.get(id); return source ? rowFromSource(source) : { ...asset, id, local: asset }; }) : [{ ...asset, local: asset }];
    });
  const linked = new Set(rows.map(row => row.source?.id).filter(Boolean));
  const candidates = catalog.list(projectId === 'carddemo' ? { sourceProjectId: 'carddemo' } : undefined).filter(asset => !linked.has(asset.id) && (plugin === 'all' || asset.pluginId === plugin));
  const selectedAsset = selected ? catalog.get(selected) : undefined;
  const pluginName = (id: string) => externalPlatforms.find(item => item.id === id)?.name ?? id;
  const inspect = (row: AssetRow) => {
    if (row.source) {
      const asset = row.source;
      showText(asset.title + ' · ' + t('pa.sourceDetail'), [t('pa.sourceLine', { name: pluginName(asset.pluginId) }), t('pa.sourceProjectLine', { name: asset.sourceProjectName }), t('pa.recordLine', { id: displayRequirementId(asset.sourceRecordId) }), t('pa.versionLine', { version: displayText(asset.version ?? t('pa.versionFallback')) }), '', displayText(asset.detail), ...asset.references.flatMap(reference => ['', `${reference.label} · ${reference.extent === 'excerpt' ? t('pa.excerpt') : t('pa.originalFile')}`, reference.path, catalog.readReference(reference) ?? t('pa.noReferenceBody')])].join('\n'));
    } else if (projectId === 'carddemo' && row.local?.id === 'history') showEvidence('E1');
    else showText(row.title, `${row.location}\n\n${row.local?.sourceAssetId ? t('pa.sourceUnavailable') : t('pa.manualRef')}\n\n${data.sources.find(source => source.file === row.location)?.content ?? t('pa.noManualBody')}`);
  };
  const close = () => { setOpen(false); setFailed(false); setSelected(undefined); form.resetFields(); };
  return <>
    <FrameworkCard title={t('pa.title')} action={canWrite ? <Button icon={<PlusOutlined />} aria-label={t('pa.link')} onClick={() => { setMode('plugin'); setPlugin('all'); setFailed(false); setOpen(true); }}>{t('pa.link')}</Button> : <Tag>{readOnly ? t('pa.readOnlySnapshot') : t('pa.readOnlyMember')}</Tag>}>
      {rows.length ? <Table<AssetRow> rowKey="id" size="small" pagination={false} scroll={{ x: 680 }} dataSource={rows} columns={[
        { title: t('pa.col.asset'), dataIndex: 'title' }, { title: t('pa.col.kind'), width: 130, dataIndex: 'kind', render: kind => <Tag>{kinds[kind] ?? kind}</Tag> },
        { title: t('pa.col.source'), render: (_, row) => <><p className="muted">{row.source ? pluginName(row.source.pluginId) + ' · ' + t('pa.sourcePlugin') : row.local?.sourceAssetId ? t('pa.sourceRecordUnavailable') : row.local?.id === 'history' ? t('pa.historyEvidence') : t('pa.manual')}</p><Mono>{row.location}</Mono></> },
        { title: t('pa.col.action'), width: 100, render: (_, row) => <Button size="small" aria-label={t('pa.viewSourceAria', { name: row.title })} onClick={() => inspect(row)}>{t('pa.viewSource')}</Button> },
      ]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('pa.empty')} />}
      {extra}
      <p className="muted">{t('pa.note')}</p>
    </FrameworkCard>
    <Modal open={open} title={t('pa.link')} width={680} footer={null} onCancel={close} closable={!busy} maskClosable={!busy} destroyOnHidden>
      {failed && <Alert type="error" title={t('pa.linkFailed')} />}
      <Tabs activeKey={mode} onChange={setMode} items={[
        { key: 'plugin', label: t('pa.sourcePlugin'), children: <div className="page-stack">
          <p className="muted">{t('pa.pluginNote')}</p>
          <Select aria-label={t('pa.filterSource')} value={plugin} onChange={value => { setPlugin(value); setSelected(undefined); }} options={[{ value: 'all', label: t('pa.allSources') }, ...externalPlatforms.map(item => ({ value: item.id, label: item.name }))]} />
          <Select aria-label={t('pa.selectSource')} placeholder={t('pa.selectSourcePlaceholder')} showSearch={{ optionFilterProp: 'label' }} value={selected} onChange={setSelected} options={candidates.map(asset => ({ value: asset.id, label: `${displayText(asset.title)} · ${pluginName(asset.pluginId)} · ${asset.sourceProjectName}`, disabled: state.workspace.connections.some(connection => connection.id === asset.pluginId && !connection.enabled) }))} notFoundContent={t('pa.noCandidates')} />
          {selectedAsset && <div><Tag>{t('pa.sourcePlugin')}</Tag><p>{displayText(selectedAsset.summary)}</p><Space wrap><Button size="small" onClick={() => inspect(rowFromSource(selectedAsset))}>{t('pa.viewSelected')}</Button><span className="muted">{displayText(selectedAsset.version ?? t('pa.versionUnrecorded'))}</span></Space></div>}
          <Button type="primary" loading={busy} disabled={!selected} onClick={async () => { setFailed(false); const saved = await update('asset.link', { projectId, sourceAssetId: selected }); if (saved) close(); else setFailed(true); }}>{t('pa.linkSelected')}</Button>
        </div> },
        { key: 'manual', label: t('pa.manual'), children: <Form form={form} layout="vertical" initialValues={{ kind: 'document' }} disabled={busy} onFinish={async values => { setFailed(false); const saved = await update('asset.add', { ...values, projectId }); if (saved) close(); else setFailed(true); }}>
          <Form.Item name="title" label={t('pa.field.name')} rules={[{ required: true, whitespace: true }]}><Input aria-label={t('pa.field.name')} maxLength={120} /></Form.Item>
          <Form.Item name="kind" label={t('pa.field.kind')} rules={[{ required: true }]}><Select options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="location" label={t('pa.field.location')} rules={[{ required: true, whitespace: true }]}><Input aria-label={t('pa.field.location')} maxLength={500} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>{t('pa.save')}</Button><p className="muted">{t('pa.manualNote')}</p>
        </Form> },
      ]} />
    </Modal>
  </>;
}
