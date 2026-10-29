import { displayRequirementId, displayText } from '../display-text.js';
import { useMemo, useState } from 'react';
import { Button, Descriptions, Drawer, Empty, Space, Table, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { externalPlatforms } from '../external-platforms.js';
import { createSourcePluginCatalog, sourceAssetKindLabels, type SourcePluginAsset } from '../source-plugins.js';

type Platform = (typeof externalPlatforms)[number];
export function EnterpriseSourceData({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const { data } = useDemo();
  const t = useT();
  const catalog = useMemo(() => createSourcePluginCatalog(data), [data]);
  const [selected, setSelected] = useState<SourcePluginAsset | null>(null), [referenceIndex, setReferenceIndex] = useState<number | null>(null);
  const assets = catalog.list({ pluginId: platform.id });
  const reference = selected && referenceIndex !== null ? selected.references[referenceIndex] : undefined;
  const referenceContent = reference ? catalog.readReference(reference) : undefined;
  return <Drawer title={t('org.source.title', { name: platform.name })} width={760} open onClose={onClose} className="enterprise-source-drawer">
    <div className="enterprise-source-body"><p className="ui-note">{t('org.source.note')}</p>
      {selected ? <><Space wrap><Button size="small" onClick={() => { setSelected(null); setReferenceIndex(null); }}>{t('org.source.back')}</Button><Tag>{sourceAssetKindLabels[selected.kind]}</Tag></Space><h3>{displayText(selected.title)}</h3><p>{displayText(selected.summary)}</p>
        <Descriptions size="small" column={1} items={[{ key:'project',label:t('org.source.project'),children:selected.sourceProjectName },{ key:'record',label:t('org.source.record'),children:displayRequirementId(selected.sourceRecordId) },{ key:'version',label:t('org.source.version'),children:displayText(selected.version ?? t('org.source.unmarked')) }]} />
        <div className="enterprise-source-detail">{displayText(selected.detail)}</div>
        {!!selected.references.length && <section><h4>{t('org.source.references')}</h4><Space wrap>{selected.references.map((item, index) => <Button key={item.collection + item.path} size="small" aria-pressed={referenceIndex === index} onClick={() => setReferenceIndex(index)}>{item.label}{item.extent === 'excerpt' ? t('org.source.excerpt') : ''}</Button>)}</Space></section>}
        {reference && <section className="enterprise-source-reference"><p className="ui-note">{reference.extent === 'excerpt' ? t('org.source.importedExcerpt', { path: reference.path }) : t('org.source.imported', { path: reference.path })}</p>{referenceContent === undefined ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('org.source.noReference')} /> : <pre>{referenceContent}</pre>}</section>}
      </> : <Table<SourcePluginAsset> size="small" rowKey="id" dataSource={assets} pagination={assets.length > 8 ? { pageSize: 8, showSizeChanger: false, size: 'small' } : false} columns={[
        { title:t('org.source.data'),key:'source',render:(_,item)=><div className="enterprise-source-entry"><Button type="link" onClick={() => setSelected(item)}>{displayText(item.title)}</Button><p>{displayText(item.summary)}</p><span>{sourceAssetKindLabels[item.kind]}{item.version ? ' · '+displayText(item.version) : ''}</span></div> },
        { title:t('org.source.project'),dataIndex:'sourceProjectName',width:126 },
      ]} locale={{emptyText:t('org.source.empty')}} />}
    </div>
  </Drawer>;
}
