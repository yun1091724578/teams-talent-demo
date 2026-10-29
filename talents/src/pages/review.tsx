// 产物管理：一个层级（团队或项目）的产物列表（需要处理的在前，其余按能力分类分组，多的折叠），以及知识产物的审阅工作台（内容、与上次版本对比、提交 PR）。
import { useState } from 'react';
import { Button, Segmented, Space, Tag, Tooltip } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import { currentT } from '../../../shared/i18n/index.ts';
import { levelHash } from '../navigation.ts';
import type { Artifact, Basis, TalentsState } from '../types.ts';
import { artifact, basisOf, capability, changesSince, levelSources, source, type Changes } from '../demo/model.ts';
import { versionLabel, when } from '../demo/format.ts';
import * as K from '../demo/knowledge.ts';
import { isDiagnosis, pendingCount } from '../demo/suggestions.ts';
import { ArtifactStatus, CapIcon, CardGrid, EmptyState, Fields, FileMark, ItemCard, Section } from '../components/ui.tsx';
import { DiffView, FileContent, FileList, IndexSummary, linkTarget } from '../components/files.tsx';
import { SubmitDialog, SubmissionLink } from '../components/submit-pr.tsx';
import { ApplyMcp } from '../components/codegraph-mcp.tsx';
import type { Toolbar } from './level.tsx';

// ---------- List ----------
/** Published knowledge whose source changed after it was built; the capability must be able to update. */
function staleChanges(st: TalentsState, a: Artifact) {
  // A code graph shows its repository's index as it is: it is never out of date.
  if (a.cap === 'codegraph') return null;
  if (a.draft || !capability(st, a.cap).update) return null;
  const c = changesSince(source(st, a.sources[0]), basisOf(a));
  return c && c.count ? c : null;
}
function StaleNote({ st, a, c }: { st: TalentsState; a: Artifact; c: Changes }) {
  const t = useT();
  const docs = source(st, a.sources[0])?.type === 'docs';
  return <div className="update-note"><b>{docs ? t('rv.docsChanged') : t('rv.codeChanged')}</b><span className="caption">{(docs ? versionLabel(c.from) + ' → ' + versionLabel(c.to) + '，' : '') + c.text}</span></div>;
}
function basisRow(st: TalentsState, a: Artifact, basis: Basis | null | undefined): [string, string] | null {
  const src = source(st, a.sources[0]);
  if (!basis || !src) return null;
  return [currentT('rv.basedOn'), currentT('rv.basedOnValue', { name: src.name, version: basis.version ? versionLabel(basis.version) : currentT('rv.submitCommit', { commit: basis.commit ?? '' }) })];
}

/** A built code graph: not reviewed; "应用" gives the Code Agent its MCP server. */
const isCodegraph = (a: Artifact) => a.cap === 'codegraph' && !!a.published;

// Re-extract opens the task form prefilled from the task that built this artifact; it does not start a run.
const reExtractHash = (a: Artifact) => levelHash(a.projectId, 'tasks', { new: '1', from: a.id });

/** Groups longer than this show their first cards and fold the rest. */
const FOLD = 6;
const sortTime = (a: Artifact) => a.draft?.created ?? a.published?.at ?? '';

export function LevelReview({ pid, toolbar }: { pid: string | null; toolbar: Toolbar }) {
  const { state: st, go } = useTalents();
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const open = (a: Artifact) => go(levelHash(pid, 'review', { id: a.id }));
  // Needs the admin: a knowledge draft to review, or a diagnosis with suggestions to submit.
  const needsAction = (a: Artifact) => isDiagnosis(a) ? pendingCount(a) > 0 : !!a.draft;
  /** Cards say only what differs: a tag when something needs attention, the version and time in the footer. */
  const card = (a: Artifact, todo: boolean) => {
    const cap = capability(st, a.cap), diagnosis = isDiagnosis(a), n = diagnosis ? pendingCount(a) : 0, stale = !diagnosis && staleChanges(st, a);
    const docs = stale && source(st, a.sources[0])?.type === 'docs';
    const tag = todo ? (diagnosis ? <Tag color="warning">{t('rv.suggestionsPending', { count: n })}</Tag> : <ArtifactStatus a={a} />)
      : stale ? <Tooltip title={(docs ? versionLabel(stale.from) + ' → ' + versionLabel(stale.to) + '，' : '') + stale.text}><Tag color="warning">{docs ? t('rv.docsStale') : t('rv.codeStale')}</Tag></Tooltip> : null;
    const footer = isCodegraph(a) ? t('cg.indexedAt', { date: when(sortTime(a)) }) : (a.published && !a.draft ? 'v' + a.published.version + ' · ' : '') + when(sortTime(a));
    return <ItemCard key={a.id} icon={<CapIcon cap={cap} />} title={a.name} subtitle={todo ? cap.name : undefined} extra={tag} onClick={() => open(a)} caption={footer}
      actions={todo ? <Button size="small" type="primary" onClick={() => open(a)}>{diagnosis ? t('rv.viewSuggestions') : t('rv.review')}</Button>
        : stale ? <Button size="small" onClick={() => go(reExtractHash(a))}>{t('rv.reExtract')}</Button> : isCodegraph(a) ? <ApplyMcp size="small" /> : undefined}>
      {a.desc && <p className="ui-note one-line" title={a.desc}>{a.desc}</p>}
    </ItemCard>;
  };
  const mine = st.artifacts.filter(a => a.projectId === pid).sort((a, b) => sortTime(a) < sortTime(b) ? 1 : -1);
  const todo = mine.filter(needsAction), rest = mine.filter(a => !needsAction(a));
  const groups = st.categories.map(cat => ({ cat, items: rest.filter(a => capability(st, a.cap)?.cat === cat.id) })).filter(g => g.items.length);
  const toggle = (id: string) => setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <>
    {toolbar()}
    {!mine.length && <EmptyState title={t('rv.noArtifacts')}>{levelSources(st, pid).length === 0 && <Button type="link" onClick={() => go(levelHash(pid, 'sources'))}>{t('rv.registerSource')}</Button>}</EmptyState>}
    {todo.length > 0 && <Section title={<span className="todo-title"><BellOutlined />{t('rv.needsAction')}</span>}><CardGrid>{todo.map(a => card(a, true))}</CardGrid></Section>}
    {groups.map(({ cat, items }) => {
      const all = expanded.has(cat.id), shown = all ? items : items.slice(0, FOLD);
      return <Section key={cat.id} title={cat.name} note={items.length}>
        <CardGrid>{shown.map(a => card(a, false))}</CardGrid>
        {items.length > FOLD && <Button type="link" className="fold-toggle" onClick={() => toggle(cat.id)}>{all ? t('rv.collapse') : t('rv.expandAll', { count: items.length })}</Button>}
      </Section>;
    })}
  </>;
}

// ---------- Workbench ----------
// The artifact is shown as it was produced; a new version of published knowledge can be compared with the
// version online. The admin publishes it as it is (there is no revising in this first version).
const isMd = (key: string) => /\.md$/.test(key);

export function Workbench({ id }: { id: string }) {
  const { state: st } = useTalents();
  const t = useT();
  const a = artifact(st, id);
  const which: K.Which = a?.draft ? 'current' : 'published';
  const [file, setFile] = useState(() => a && !K.isIndex(a) ? (K.files(a, which).find(f => !/index\.md$/.test(f)) ?? a.files?.[0] ?? null) : null);
  const [tab, setTab] = useState<'content' | 'diff'>('content');
  const [publishing, setPublishing] = useState(false);
  if (!a) return <EmptyState>{t('rv.notFound')}<a href="#/projects">{t('rv.backToProjects')}</a></EmptyState>;
  const cap = capability(st, a.cap), files = K.isIndex(a) ? [] : K.files(a, which);
  // Only a new version of published knowledge has something to compare with.
  const comparable = !!a.draft && !!a.published && !K.isIndex(a);
  const online = (key: string) => K.files(a, 'published').includes(key) ? K.text(a, 'published', key) : null;
  const mark = (key: string) => {
    if (!comparable || !isMd(key)) return null;
    const before = online(key);
    if (before == null) return <FileMark kind="new" />;
    return before !== K.text(a, 'current', key) ? <FileMark kind="mod" /> : null;
  };

  let main;
  if (K.isIndex(a)) main = <IndexSummary a={a} />;
  else if (!file) main = null;
  else if (tab === 'diff' && comparable) main = isMd(file) ? <div className="diff-wrap"><DiffView before={online(file)} after={K.text(a, 'current', file)} /></div>
    : <div className="index-summary"><p className="ui-note">{t('rv.diffUnsupported')}</p></div>;
  else main = <FileContent st={st} a={a} file={file} text={K.text(a, which, file)} />;

  return <div className="wb">
    <PageHeader title={a.name} description={isCodegraph(a) ? cap.name + ' · ' + a.published!.note : cap.name} actions={<Space><ArtifactStatus a={a} />{isCodegraph(a) && <ApplyMcp />}{(a.draft || (a.kind === 'files' && !a.submission)) && <Button type="primary" onClick={() => setPublishing(true)}>{K.isIndex(a) ? t('rv.enableRemoteIndex') : t('rv.submitPr')}</Button>}</Space>} />
    <div className={'wb-body' + (files.length ? '' : ' no-files')}>
      {files.length > 0 && <FileList current={file} onSelect={setFile} groups={K.fileGroups(a, files).map(g => ({ title: g.title, items: g.items.map(f => ({ key: f, indent: !!g.title, label: <>{K.fileLabel(f)}{mark(f)}</> })) }))} />}
      <section className="wb-main">
        {comparable && <div className="wb-toolbar">
          <Segmented value={tab} onChange={v => setTab(v as typeof tab)} options={[{ value: 'content', label: t('rv.content') }, { value: 'diff', label: t('rv.diffAgainst', { version: a.published!.version }) }]} />
        </div>}
        <div className="wb-view" key={file + tab} onClick={e => { const target = file && linkTarget(e, file); if (target && a.files?.includes(target)) setFile(target); }}>{main}</div>
      </section>
      <aside className="wb-side"><div className="side-body">
        {!a.draft ? <PublishedSide st={st} a={a} /> : <>
          <h3>{a.published ? t('ui.newVersionDraft') : t('ui.draft')}</h3>
          <Fields rows={[[t('rv.generatedAt'), when(a.draft.created)], basisRow(st, a, a.draft.basis), !!a.published && [t('rv.lastVersion'), t('rv.lastVersionValue', { version: a.published.version, time: when(a.published.at) })]]} />
        </>}
      </div></aside>
    </div>
    {publishing && <SubmitDialog a={a} onClose={() => setPublishing(false)} />}
  </div>;
}

function PublishedSide({ st, a }: { st: TalentsState; a: Artifact }) {
  const { go } = useTalents();
  const t = useT();
  const p = a.published!, stale = staleChanges(st, a);
  return <><h3>{a.cap === 'codegraph' ? t('ui.codeGraph') : K.isIndex(a) ? t('ui.remoteIndex') : a.submission ? t('ui.prCreated') : t('ui.hasVersion')}</h3>
    <Fields rows={[[t('rv.version'), 'v' + p.version], [t('rv.generatedAt'), p.at], basisRow(st, a, p.basis), [t('rv.updateNote'), p.note]]} />
    {a.submission && <SubmissionLink submission={a.submission} />}
    {stale && <><StaleNote st={st} a={a} c={stale} /><div className="actions"><Button onClick={() => go(reExtractHash(a))}>{t('rv.reExtract')}</Button></div></>}
  </>;
}
