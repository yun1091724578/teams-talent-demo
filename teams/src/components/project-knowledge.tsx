import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Segmented, Space, Spin, Tag } from 'antd';
import { marked } from 'marked';
import { getTalentsFile, getTalentsKnowledge } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { talentLink } from './common.js';
import type { PublishedArtifact, PublishedFile } from '../../../shared/contracts.js';

// Category and delivery names are module-level vocabularies, so getters keep `labels[id]`,
// Object.keys and Object.hasOwn working while every read resolves against the ambient locale.
function labelGetters<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  return Object.defineProperties({} as Record<K, string>, Object.fromEntries(
    (Object.keys(keys) as K[]).map(key => [key, { get: () => currentT(keys[key]), enumerable: true }]),
  ));
}
const categoryKeys: Record<string, MessageKey> = { index: 'pk.category.index', doc: 'pk.category.doc', code: 'pk.category.code', traj: 'pk.category.traj' };
const categoryNames: Record<string, string | undefined> = Object.defineProperties({} as Record<string, string | undefined>, Object.fromEntries(
  Object.entries(categoryKeys).map(([id, key]) => [id, { get: () => currentT(key), enumerable: true }]),
));
const categoryOrder = ['doc', 'code', 'traj', 'index'];
const deliveryNames = labelGetters({ local: 'pk.delivery.local', cloud: 'pk.delivery.cloud' } as const);
const day = (value: string) => value.slice(0, 16).replace('T', ' ');

/** Renders one published file the way Talents shows it: markdown, a standalone HTML report, or plain text. */
function FileView({ artifact, file }: { artifact: PublishedArtifact; file: PublishedFile }) {
  const t = useT();
  const [content, setContent] = useState<string | null>(null), [failure, setFailure] = useState('');
  useEffect(() => {
    let live = true; setContent(null); setFailure('');
    getTalentsFile(artifact, file.path).then(value => { if (live) setContent(value.content); }).catch(error => { if (live) setFailure((error as Error).message); });
    return () => { live = false; };
  }, [artifact.id, artifact.version, file.path]);
  if (failure) return <Alert type="error" showIcon title={t('pk.fileReadFailed')} description={failure} />;
  if (content === null) return <Spin size="small" />;
  if (file.type === 'markdown' || file.type === 'html') {
    const html = file.type === 'markdown' ? marked.parse(content, { async: false }) : content;
    // Published content is untrusted. Keep its rendering outside the Teams origin,
    // with no scripts, network, forms or parent navigation privileges.
    const dark = document.documentElement.dataset.theme === 'dark';
    const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'"><style>body{font:14px/1.7 system-ui,sans-serif;margin:16px;color:${dark ? '#e5e7eb' : '#1f2937'};background:${dark ? '#18181b' : '#ffffff'};overflow-wrap:anywhere}pre{white-space:pre-wrap}img{max-width:100%}table{border-collapse:collapse}th,td{padding:6px;border:1px solid #888}a{color:${dark ? '#93c5fd' : '#2459a6'}}</style>`;
    return <iframe className={'talents-report' + (file.type === 'markdown' ? ' talents-markdown' : '')} title={file.title} sandbox="" referrerPolicy="no-referrer" srcDoc={head + html} />;
  }
  return <pre className="talents-plain">{content}</pre>;
}

function ArtifactDrawer({ artifact, onClose }: { artifact: PublishedArtifact; onClose: () => void }) {
  const t = useT();
  const [path, setPath] = useState(artifact.files[0]?.path);
  const file = artifact.files.find(item => item.path === path);
  return <Drawer className="talents-artifact-drawer" title={artifact.name} width={880} open onClose={onClose} destroyOnHidden>
    <Descriptions size="small" column={2} items={[
      { key: 'capability', label: t('pk.capability'), children: artifact.capabilityName },
      // A code graph is the repository's index as it is: its note says when the index was updated, it shows no version.
      ...(artifact.capability === 'codegraph' ? [] : [{ key: 'version', label: t('pk.version'), children: `v${artifact.version} · ${day(artifact.publishedAt)}` }]),
      { key: 'delivery', label: t('pk.delivery'), children: deliveryNames[artifact.delivery] },
      { key: 'note', label: t('pk.updateNote'), children: artifact.note },
      ...(artifact.stats ?? []).map(([label, value]) => ({ key: label, label, children: value })),
    ]} />
    {artifact.kind === 'index'
      ? <><p className="muted">{t('pk.indexNote')}</p>{artifact.capability === 'codegraph' && <Button href={talentLink('review', { projectId: artifact.projectId ?? undefined }) + '&id=' + encodeURIComponent(artifact.id)} target="_blank" rel="noreferrer">{t('pk.viewCodeGraph')}</Button>}</>
      : <>{artifact.files.length > 1 && <Segmented className="talents-file-tabs" value={path} onChange={value => setPath(value as string)} options={artifact.files.map(item => ({ value: item.path, label: item.title }))} />}
        {file && <FileView artifact={artifact} file={file} />}</>}
  </Drawer>;
}

/** Knowledge Talents has published for this project, read by the Teams server from the shared data directory. */
export function ProjectKnowledge({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const { state, role } = useDemo();
  const t = useT();
  const [expanded, setExpanded] = useState(false), [opened, setOpened] = useState<PublishedArtifact | null>(null);
  const [artifacts, setArtifacts] = useState<PublishedArtifact[] | null>(null), [failure, setFailure] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true; setFailure('');
    getTalentsKnowledge(projectId).then(value => { if (live) setArtifacts(value.artifacts); }).catch(error => { if (live) setFailure((error as Error).message); });
    return () => { live = false; };
  }, [projectId, state.revision, attempt]);
  useEffect(() => { setArtifacts(null); setOpened(null); setExpanded(false); }, [projectId, role]);
  useEffect(() => { const refresh = () => setAttempt(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  const loading = artifacts === null && !failure, ready = !!artifacts?.length;
  const status = loading ? t('pk.reading') : failure ? t('pk.readFailed') : ready ? t('pk.published', { count: artifacts!.length }) : t('pk.notPublished');
  const groups = categoryOrder.concat([...new Set((artifacts ?? []).map(item => item.category))].filter(id => !categoryOrder.includes(id)))
    .map(id => ({ id, items: (artifacts ?? []).filter(item => item.category === id) })).filter(group => group.items.length);
  const content = <div className="project-knowledge talents-knowledge" data-knowledge-project={projectId}>
    {loading ? <Space><Spin size="small" /><span className="muted">{t('pk.loading')}</span></Space>
      : failure ? <Alert showIcon type="error" title={t('pk.loadFailed')} description={failure} action={<Button onClick={() => setAttempt(value => value + 1)}>{t('pk.retry')}</Button>} />
      : ready ? groups.map(group => <section key={group.id} className="talents-knowledge-group"><h4>{categoryNames[group.id] ?? group.id}</h4>
        <div className="project-material-list">{group.items.map(artifact => <div className="project-material" key={artifact.id} data-artifact={artifact.id}><div>
          <strong>{artifact.name}</strong><p>{artifact.description}</p>
          <small>{artifact.capabilityName}{artifact.capability === 'codegraph' ? '' : ` · v${artifact.version} · ${t('pk.publishedAt', { date: day(artifact.publishedAt) })}`}{artifact.note ? ' · ' + artifact.note : ''}</small>
        </div>{artifact.projectId === null && <Tag>{t('pk.teamKnowledge')}</Tag>}<Tag>{deliveryNames[artifact.delivery]}</Tag><Button size="small" onClick={() => setOpened(artifact)}>{t('pk.view')}</Button></div>)}</div></section>)
      : <><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('pk.empty')} /><p className="muted">{t('pk.prNote')}</p></>}
    <Space wrap className="card-actions">
      {role === 'owner' && <Button href={talentLink('knowledge', { projectId, role })}>{t('pk.digMineKnowledge')}</Button>}
      {!loading && <Button size="small" onClick={() => setAttempt(value => value + 1)}>{t('pk.refresh')}</Button>}
    </Space>
    {opened?.projectId === projectId && <ArtifactDrawer key={opened.id + ":" + opened.version} artifact={opened} onClose={() => setOpened(null)} />}
  </div>;
  const card = <FrameworkCard title={t('pk.title')} action={<Tag color={ready && !failure ? 'green' : undefined}>{status}</Tag>}>{content}</FrameworkCard>;
  if (!compact) return card;
  return <div className="overview-knowledge-summary" data-knowledge-summary={projectId}>
    <strong>{t('pk.title')}</strong><Tag color={ready && !failure ? 'green' : undefined}>{status}</Tag><span className="muted">{failure ? t('pk.failureShort') : ready ? t('pk.artifactCount', { count: artifacts!.length }) : t('pk.fromTalents')}</span><Button size="small" onClick={() => setExpanded(true)}>{t('pk.viewKnowledge')}</Button>
    {failure && <Button size="small" onClick={() => setAttempt(value => value + 1)}>{t('pk.retry')}</Button>}
    <Drawer className="project-knowledge-drawer" title={t('pk.title')} width={760} open={expanded} onClose={() => setExpanded(false)} destroyOnHidden>{card}</Drawer>
  </div>;
}
