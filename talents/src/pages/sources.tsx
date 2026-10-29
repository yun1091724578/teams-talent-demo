// 来源：一个层级（团队或项目）的代码仓和文档集；项目另有成员共享的会话和项目 Skill。代码仓、设计文档、
// 会话和 Skill 来自 iCode Teams，在这里只读；Talents 只登记本地文档目录。
import { useEffect, useState, type ReactNode } from 'react';
import { App, AutoComplete, Button, Collapse, Drawer, Form, Input, Modal, Space, Table, Tag, type TableColumnsType } from 'antd';
import { ExportOutlined, PlusOutlined } from '@ant-design/icons';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import { currentT } from '../../../shared/i18n/index.ts';
import { levelHash } from '../navigation.ts';
import type { DocVersion, ProjectSkill, Session, SkillVersion, Source, TalentsState } from '../types.ts';
import { changeCounts, knownFiles, latestVersion, levelName, levelSessions, levelSources, memberName, project, source, sourceFiles } from '../demo/model.ts';
import { now, tokens, uid, when } from '../demo/format.ts';
import { getSkill } from '../api.ts';
import { Markdown } from '../components/files.tsx';
import { currentSkill } from '../demo/suggestions.ts';
import { CardGrid, EmptyState, Fields, FileMark, ItemCard, Section, SourceIcon } from '../components/ui.tsx';
import type { Toolbar } from './level.tsx';

/** A Teams repository has a path only once its workspace is bound in the Teams project overview. */
const unbound = (s: Source) => s.type === 'repo' && !s.bound;
const SourcePath = ({ s }: { s: Source }) => unbound(s) ? <span className="ui-note">{currentT('src.unbound')}</span> : <span className="path">{s.path}</span>;
const fromText = (s: Source) => s.from ? currentT(s.from.kind === 'teams' ? 'src.fromTeams' : s.from.kind === 'git' ? 'src.fromGit' : 'src.fromShared') : '';

export function LevelSources({ pid, toolbar }: { pid: string | null; toolbar: Toolbar }) {
  const { state: st, teamsLink } = useTalents();
  const t = useT();
  const [open, setOpen] = useState<string | null>(null), [registering, setRegistering] = useState(false);
  const [collection, setCollection] = useState<'sessions' | 'skills' | null>(null);
  const list = levelSources(st, pid), p = project(st, pid);
  const card = (s: Source) => <ItemCard key={s.id} icon={<SourceIcon type={s.type} />} title={s.name} subtitle={<SourcePath s={s} />} onClick={() => setOpen(s.id)}
    caption={s.fromTeams ? <Tag>iCode Teams</Tag> : <Tag>{t('src.localRegistered')}</Tag>}
    actions={<Button type="link" size="small" onClick={() => setOpen(s.id)}>{t('src.details')}</Button>}>
    {s.desc && <p>{s.desc}</p>}
    <Fields rows={s.type === 'repo' ? [[t('src.branch'), s.branch]] : [[t('src.files'), fromText(s) ? t('src.fileCountWithFrom', { count: s.files ?? 0, from: fromText(s) }) : t('src.fileCount', { count: s.files ?? 0 })], !!latestVersion(s) && [t('src.lastChanged'), when(latestVersion(s))]]} />
  </ItemCard>;
  const section = (type: Source['type'], title: string, empty: ReactNode) => {
    const items = list.filter(s => s.type === type);
    return <Section title={title} note={items.length}>{items.length ? <CardGrid>{items.map(card)}</CardGrid> : <EmptyState>{empty}</EmptyState>}</Section>;
  };
  return <>
    {toolbar(<Button type="primary" icon={<PlusOutlined />} onClick={() => setRegistering(true)}>{t('src.registerLocal')}</Button>)}
    {p ? <>
      {section('repo', t('lv.repo'), <>{t('src.noRepos')} <a href={teamsLink(p.id)}>{t('src.addInTeams')}</a></>)}
      {section('docs', t('lv.docs'), <>{t('src.noDocs')} <a href={teamsLink(p.id)}>{t('src.addInTeams')}</a></>)}
      <TeamsCollections p={p} sessions={levelSessions(st, p.id)} onOpen={setCollection} />
    </> : section('docs', t('lv.docs'), t('src.noDocs'))}
    {open && source(st, open) && <SourceDrawer id={open} onClose={() => setOpen(null)} />}
    {p && collection === 'sessions' && <SessionsDrawer sessions={levelSessions(st, p.id)} onClose={() => setCollection(null)} />}
    {p && collection === 'skills' && <SkillsDrawer pid={p.id} skills={p.skills} onClose={() => setCollection(null)} />}
    {registering && <RegisterSource pid={pid} onClose={() => setRegistering(false)} />}
  </>;
}

// ---------- Sessions and skills (from Teams, read-only) ----------
// Each is one card; the card opens a drawer listing them, and a row switches the drawer to its details.
const PAGE = 10;
const latest = (sessions: Session[]) => sessions.reduce((a, s) => s.updated > a ? s.updated : a, '');
function TeamsCollections({ p, sessions, onOpen }: { p: { skills: ProjectSkill[] }; sessions: Session[]; onOpen(which: 'sessions' | 'skills'): void }) {
  const t = useT();
  const members = new Set(sessions.map(s => s.owner)).size, names = p.skills.slice(0, 2).map(s => s.name).join(t('common.listSeparator'));
  const card = (which: 'sessions' | 'skills', title: string, rows: [string, ReactNode][]) =>
    <ItemCard key={which} icon={<SourceIcon type={which} />} title={title} onClick={() => onOpen(which)}
      caption={<Tag>iCode Teams</Tag>} actions={<Button type="link" size="small" onClick={() => onOpen(which)}>{t('src.view')}</Button>}><Fields rows={rows} /></ItemCard>;
  return <Section title={t('src.collections')}>
    <CardGrid>
      {card('sessions', t('src.sharedSessions'), sessions.length
        ? [[t('src.sessionsLabel'), t('src.sessionsSummary', { count: sessions.length, members })], [t('src.recentlyUpdated'), when(latest(sessions))]] : [[t('src.sessionsLabel'), t('src.zeroCount')]])}
      {card('skills', t('src.projectSkills'), p.skills.length
        ? [[t('src.skillsLabel'), t('src.skillCount', { count: p.skills.length })], [t('src.includes'), names + (p.skills.length > 2 ? t('src.etcSuffix') : '')]] : [[t('src.skillsLabel'), t('src.zeroCount')]])}
    </CardGrid>
  </Section>;
}

/** A drawer listing items with search and pages; picking one shows its details in the same drawer. */
function ListDrawer<T extends { id: string }>({ title, items, search, columns, detail, onClose }: {
  title: string; items: T[]; search(item: T, q: string): boolean; columns: TableColumnsType<T>;
  detail(item: T): { title: ReactNode; body: ReactNode }; onClose(): void;
}) {
  const t = useT();
  const [q, setQ] = useState(''), [page, setPage] = useState(1), [picked, setPicked] = useState<T | null>(null);
  const shown = items.filter(item => !q.trim() || search(item, q.trim().toLowerCase())), d = picked && detail(picked);
  return <Drawer open width={760} onClose={onClose} title={d ? <div><a className="caption" onClick={() => setPicked(null)}>← {t('src.backTo', { title })}</a><div>{d.title}</div></div> : <div><div className="caption">{t('src.fromTeams')}</div>{title}</div>}>
    {d ? d.body : <div className="form-body">
      <Input.Search allowClear value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={t('src.searchName')} />
      <Table<T> size="small" rowKey="id" dataSource={shown} columns={columns} locale={{ emptyText: t('src.noResults') }}
        pagination={shown.length > PAGE && { current: page, pageSize: PAGE, onChange: setPage, showSizeChanger: false, size: 'small' }}
        onRow={item => ({ onClick: () => setPicked(item), className: 'row-click' })} />
    </div>}
  </Drawer>;
}

function SessionsDrawer({ sessions, onClose }: { sessions: Session[]; onClose(): void }) {
  const { state: st } = useTalents();
  const t = useT();
  const owner = (s: Session) => memberName(st, s.owner, s.ownerName);
  return <ListDrawer<Session> title={t('src.sharedSessions')} items={[...sessions].sort((a, b) => a.updated < b.updated ? 1 : -1)} onClose={onClose}
    search={(s, q) => s.title.toLowerCase().includes(q) || s.id.includes(q) || owner(s).includes(q)}
    columns={[
      { title: t('tk.name'), dataIndex: 'title' },
      { title: t('tk.member'), width: 80, render: (_, s) => owner(s) },
      { title: t('src.requirement'), width: 120, render: (_, s) => s.requirementId ?? <span className="ui-note">{t('src.none')}</span> },
      { title: t('tk.turns'), dataIndex: 'turns', align: 'right', width: 90 },
      { title: t('tk.lastUpdated'), width: 110, className: 'nowrap', render: (_, s) => when(s.updated) },
    ]}
    detail={s => ({ title: s.title, body: <div className="form-body">
      {s.summary && <p>{s.summary}</p>}
      <Fields rows={[[t('tk.member'), owner(s)], !!s.agent && ['Agent', s.agent], !!s.model && [t('src.model'), s.model], [t('src.requirement'), s.requirementId ?? <span className="ui-note">{t('src.none')}</span>],
        [t('tk.turns'), s.turns], [t('tk.messages'), s.messages], ['Token', tokens(s.tokens)], [t('tk.lastUpdated'), when(s.updated)], !!s.cwd && [t('src.cwd'), <span className="path">{s.cwd}</span>], [t('src.sessionId'), <code>{s.id}</code>]]} />
    </div> })} />;
}

function SkillsDrawer({ pid, skills, onClose }: { pid: string; skills: ProjectSkill[]; onClose(): void }) {
  const { state: st } = useTalents();
  const t = useT();
  // A skill Talents wrote a new version of shows that version (Teams takes it up from the shared directory).
  const written = (s: ProjectSkill) => currentSkill(st, pid, s.id)?.written ?? null;
  return <ListDrawer<ProjectSkill> title={t('src.projectSkills')} items={skills} onClose={onClose}
    search={(s, q) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)}
    columns={[
      { title: t('tk.name'), width: 220, render: (_, s) => <code>{s.name}</code> },
      { title: t('rv.version'), width: 130, render: (_, s) => written(s) ? <>{written(s)!.version} <Tag color="purple">{t('src.talentsImproved')}</Tag></> : s.version },
      { title: t('src.description'), dataIndex: 'description', ellipsis: true },
    ]}
    detail={s => ({ title: s.name, body: <SkillDetail pid={pid} skill={s} written={written(s)} /> })} />;
}
function SkillDetail({ pid, skill, written }: { pid: string; skill: ProjectSkill; written: SkillVersion | null }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null), [error, setError] = useState('');
  const writtenText = written?.files.find(f => f.path === 'SKILL.md')?.text;
  useEffect(() => { if (writtenText) setText(writtenText); else getSkill(pid, skill.id).then(s => setText(s.content), e => setError((e as Error).message)); }, [pid, skill.id, writtenText]);
  return <div className="form-body">
    <Fields rows={written ? [[t('rv.version'), <>{written.version} <Tag color="purple">{t('src.talentsImproved')}</Tag></>], [t('rv.basedOn'), skill.version], [t('src.description'), skill.description], [t('src.improvement'), t('src.improvementValue', { note: written.note, time: when(written.at) })],
      [t('src.modifiedFiles'), written.files.map(f => f.path).join(t('common.listSeparator'))]] : [[t('rv.version'), skill.version], [t('src.description'), skill.description], [t('src.path'), <span className="path">{skill.path}</span>]]} />
    {error ? <p className="hint">{error}</p> : text === null ? <p className="ui-note">{t('src.readingSkill')}</p> : <article className="markdown"><Markdown text={text} /></article>}
  </div>;
}

// ---------- Details ----------
function projectField(st: TalentsState, s: Source): [string, ReactNode] {
  return [currentT('tk.belongsTo'), levelName(st, s.projectId ?? null)];
}

/** Checking a Teams document set compares the documents Teams lists now with the latest recorded version;
 *  a difference is recorded as a new version. Local directories are mock: their check finds no change. */
function check(s: Source): DocVersion | null {
  s.lastCheck = now();
  if (!s.fromTeams || s.type !== 'docs') return null;
  const files = sourceFiles(s), known = knownFiles(s);
  const added = files.filter(f => !known.includes(f)), removed = known.filter(f => !files.includes(f));
  if (!added.length && !removed.length) return null;
  const v: DocVersion = { at: s.lastCheck };
  if (added.length) v.added = added;
  if (removed.length) v.removed = removed;
  s.versions = [v, ...(s.versions ?? [])];
  return v;
}

function VersionList({ versions }: { versions: DocVersion[] }) {
  const t = useT();
  return <Collapse size="small" className="version-list" items={versions.map(v => {
    const c = { added: v.added ?? [], modified: v.modified ?? [], removed: v.removed ?? [] };
    return v.initial
      ? { key: v.at, label: <><b>{when(v.at)}</b> <span className="ui-note">{t('src.firstCheck', { count: v.initial })}</span></>, children: v.files ? <ul className="file-lines">{v.files.map(f => <li key={f}>{f}</li>)}</ul> : null, collapsible: v.files ? undefined : 'disabled' as const }
      : { key: v.at, label: <><b>{when(v.at)}</b> <span>{changeCounts(c)}</span></>, children: <ul className="file-lines">
          {c.added.map(f => <li key={f}><FileMark kind="new" />{f}</li>)}{c.modified.map(f => <li key={f}><FileMark kind="mod" />{f}</li>)}{c.removed.map(f => <li key={f}><FileMark kind="del" />{f}</li>)}
        </ul> };
  })} />;
}

const FILE_ROWS = 10;
function DocsDetail({ st, s, checking, onCheck }: { st: TalentsState; s: Source; checking: boolean; onCheck(): void }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const versions = s.versions ?? [], latest = versions[0] ?? {}, first = versions.length ? versions[versions.length - 1].at : '', titles = s.titles ?? {};
  // When each file last changed: the newest version that added or modified it, otherwise the first version.
  const changedAt: Record<string, string> = {};
  versions.forEach(v => [...(v.added ?? []), ...(v.modified ?? [])].forEach(f => { changedAt[f] ??= v.at; }));
  const files = (s.tree ?? []).flatMap(g => g.files.map(f => ({ name: f, dir: g.dir || t('src.rootDir'), key: (g.dir ? g.dir + '/' : '') + f })));
  const from = !s.from ? null : s.from.kind === 'git' ? <>{t('src.fromGit')} <span className="path">{s.from.origin}</span>{t('src.gitBranch', { branch: s.from.branch ?? '' })}</>
    : s.from.kind === 'teams' ? t('src.teamsDocsFromTeams', { project: s.from.project ?? '' }) : t('src.sharedDir');
  return <div className="form-body">
    {s.desc && <p>{s.desc}</p>}
    <Fields rows={[[t('src.path'), <span className="path">{s.path}</span>], !!from && [t('src.from'), from], [t('src.files'), t('src.fileCount', { count: s.files ?? 0 })],
      [t('src.lastCheck'), <>{when(s.lastCheck)} <Button type="link" size="small" loading={checking} onClick={onCheck}>{t('src.checkUpdates')}</Button></>],
      versions.length > 0 && [t('src.versionHistory'), <VersionList versions={versions} />],
      projectField(st, s)]} />
    <div className="field"><span className="label">{t('src.files')}</span>
      <Table size="small" pagination={false} rowKey="key" dataSource={all ? files : files.slice(0, FILE_ROWS)} columns={[
        { title: t('src.fileName'), render: (_, f) => <>{f.name}{latest.added?.includes(f.key) ? <FileMark kind="new" /> : latest.modified?.includes(f.key) ? <FileMark kind="mod" /> : null}{titles[f.key] && <div className="caption">{titles[f.key]}</div>}</> },
        { title: t('src.directory'), dataIndex: 'dir', className: 'ui-note', width: 160, ellipsis: { showTitle: true } },
        { title: t('src.updatedAt'), className: 'ui-note nowrap', render: (_, f) => when(changedAt[f.key] ?? first) },
      ]} />
      {!all && files.length > FILE_ROWS && <Button type="link" size="small" onClick={() => setAll(true)}>{t('src.showMoreFiles', { count: files.length - FILE_ROWS })}</Button>}
    </div>
  </div>;
}

function SourceDrawer({ id, onClose }: { id: string; onClose(): void }) {
  const { state: st, update, go, toast, teamsLink } = useTalents();
  const { modal } = App.useApp();
  const t = useT();
  const [checking, setChecking] = useState(false), [editing, setEditing] = useState(false);
  const s = source(st, id)!, local = !s.fromTeams;
  const runCheck = () => {
    setChecking(true);
    setTimeout(() => {
      const v = update(d => check(source(d, id)!));
      setChecking(false);
      toast(v ? t('src.checkChanged', { changes: changeCounts({ added: v.added ?? [], modified: [], removed: v.removed ?? [] }) }) : t('src.checkUnchanged'));
    }, 900);
  };
  const remove = () => modal.confirm({
    title: t('src.removeTitle', { name: s.name }), content: t('src.removeBody'), okText: t('src.removeOk'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
    onOk: () => {
      update(d => { d.sources = d.sources.filter(x => x.id !== id); });
      onClose(); toast(t('src.removed'));
    },
  });
  const kind = s.type === 'repo' ? t('lv.repo') : t('lv.docs');
  return <Drawer open width={560} onClose={onClose} title={<div><div className="caption">{t(local ? 'src.drawerKindLocal' : 'src.drawerKindTeams', { kind })}</div>{s.name}</div>}
    extra={local && <Button onClick={() => setEditing(true)}>{t('src.edit')}</Button>}
    footer={<div className="drawer-foot">{local ? <Button danger onClick={remove}>{t('src.removeSource')}</Button> : <Button href={teamsLink(s.projectId)} icon={<ExportOutlined />}>{t('src.manageInTeams')}</Button>}
      <span className="spacer" /><Button disabled={unbound(s)} title={unbound(s) ? t('src.bindHint') : undefined} onClick={() => { onClose(); go(levelHash(s.projectId ?? null, 'tasks', { new: '1', source: id })); }}>{t('src.newTask')}</Button></div>}>
    {s.type === 'repo'
      ? <div className="form-body">{s.desc && <p>{s.desc}</p>}<Fields rows={[[t('src.path'), <SourcePath s={s} />], !!s.origin && [t('src.remote'), <span className="path">{s.origin}</span>], [s.bound ? t('src.baselineBranch') : t('src.branch'), s.branch],
          !!s.commit && [t('src.lastCommit'), <><code>{s.commit.sha}</code> {s.commit.message}<div className="caption">{s.commit.time}</div></>], projectField(st, s)]} /></div>
      : <DocsDetail st={st} s={s} checking={checking} onCheck={runCheck} />}
    {editing && <EditSource s={s} onClose={() => setEditing(false)} />}
  </Drawer>;
}

function EditSource({ s, onClose }: { s: Source; onClose(): void }) {
  const { update, toast } = useTalents();
  const t = useT();
  const [form] = Form.useForm<{ name: string; desc: string }>();
  const save = (v: { name: string; desc?: string }) => {
    update(d => { const x = source(d, s.id)!; x.name = v.name.trim(); x.desc = (v.desc ?? '').trim(); });
    onClose(); toast(t('src.save'));
  };
  return <Modal open title={<div><div className="caption">{t('src.localDocsDir')}</div>{t('src.editSource')}</div>} okText={t('src.save')} cancelText={t('common.cancel')} onOk={() => form.submit()} onCancel={onClose}>
    <Form form={form} layout="vertical" onFinish={save} initialValues={{ name: s.name, desc: s.desc ?? '' }}>
      <Form.Item name="name" label={t('tk.name')} rules={[{ required: true, whitespace: true, message: t('src.nameRequired') }]}><Input /></Form.Item>
      <Form.Item name="desc" label={t('src.description')}><Input.TextArea rows={2} placeholder={t('src.descPlaceholder')} /></Form.Item>
    </Form>
  </Modal>;
}

// ---------- Register a local document directory ----------
interface Sample { path: string; files: number; ext: string; from: NonNullable<Source['from']>; tree: { dir: string; files: string[] }[] }
const samples: Sample[] = [
  { path: '/Volumes/team-share/carddemo/meeting-notes', files: 46, ext: 'md 46', from: { kind: 'shared' }, tree: [{ dir: '', files: ['2026-10-21 需求评审.md', '2026-10-14 架构评审.md', '2026-10-09 返现方案周会.md'] }] },
  { path: '~/work/carddemo/requirements', files: 31, ext: 'md 18、docx 9、pdf 4', from: { kind: 'git', origin: 'git@code.bank.local:carddemo/carddemo-requirements.git', branch: 'main' }, tree: [{ dir: '2026Q3', files: ['分期还款需求说明.docx', '额度调整需求说明.md'] }, { dir: '2026Q4', files: ['营销活动二期需求.md', '账单分期改造.md'] }] },
];
/** Registers a local document directory in the level (team or project) the user is in. */
function RegisterSource({ pid, onClose }: { pid: string | null; onClose(): void }) {
  const { state: st, update, toast } = useTalents();
  const t = useT();
  const [path, setPath] = useState(samples[0].path), [probing, setProbing] = useState(false), [probe, setProbe] = useState<Sample | null>(null);
  const [name, setName] = useState(''), [desc, setDesc] = useState('');
  const read = () => {
    if (!path.trim()) return;
    setProbing(true);
    setTimeout(() => {
      const base: Sample = structuredClone(samples.find(x => x.path === path.trim()) ?? samples[0]);
      base.path = path.trim();
      setProbe(base); setName(base.path.split('/').pop()!); setProbing(false);
    }, 700);
  };
  const submit = () => {
    const p = probe!, id = uid('s');
    const src: Source = { id, type: 'docs', name: name.trim() || p.path.split('/').pop()!, path: p.path, files: p.files, tree: p.tree,
      from: p.from, lastCheck: now(), versions: [{ at: now(), initial: p.files }], desc: desc.trim(), projectId: pid };
    update(d => { d.sources.push(src); });
    onClose(); toast(t('src.registered', { name: src.name }));
  };
  return <Drawer open width={520} title={<div><div className="caption">{levelName(st, pid)}</div>{t('src.registerLocal')}</div>} onClose={onClose}
    footer={<div className="drawer-foot"><span className="spacer" /><Button onClick={onClose}>{t('common.cancel')}</Button><Button type="primary" disabled={!probe} onClick={submit}>{t('src.register')}</Button></div>}>
    <div className="form-body">
      <div className="field"><span className="label"><span className="step">1</span>{t('src.directoryLabel')}</span>
        <Space.Compact style={{ width: '100%' }}>
          <AutoComplete style={{ flex: 1 }} value={path} onChange={setPath} options={samples.map(x => ({ value: x.path }))} placeholder={t('src.dirPlaceholder')} />
          <Button loading={probing} onClick={read}>{t('src.read')}</Button>
        </Space.Compact>
        {probe && <div className="info-box"><Fields rows={[[t('src.from'), probe.from.kind === 'git' ? <>{t('src.fromGit')} <span className="path">{probe.from.origin}</span></> : t('src.sharedDir')],
          [t('src.files'), t('src.fileCountExt', { count: probe.files, ext: probe.ext })], [t('src.sample'), probe.tree[0].files.slice(0, 2).join(t('common.listSeparator'))]]} /></div>}
      </div>
      {probe && <>
        <label className="field"><span className="label"><span className="step">2</span>{t('tk.name')}</span><Input value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span className="label">{t('src.description')}</span><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('src.descPlaceholder')} /></label>
      </>}
    </div>
  </Drawer>;
}
