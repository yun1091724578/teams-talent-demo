// 知识任务：一个层级（团队或项目）的任务列表（当前任务分定时任务和一次性任务，另有已完成），任务详情与
// 运行进度，新建任务（来源在单独的选择弹窗中选）。运行可以取消，任务可以删除，定时任务可以暂停。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, App, Button, Checkbox, Collapse, Drawer, Input, InputNumber, Modal, Progress, Radio, Segmented, Select, Space, Steps, Table, Tag } from 'antd';
import { PlusOutlined, StarOutlined } from '@ant-design/icons';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import { currentT } from '../../../shared/i18n/index.ts';
import { levelHash } from '../navigation.ts';
import type { Capability, Session, TalentsState, Task } from '../types.ts';
import { artifact, basisOf, capability, changesSince, levelName, levelSessions, levelSources, member, memberName, project, session, source, task, taskName } from '../demo/model.ts';
import { cancelRun, existingArtifact, runPlan, runProgress, runsOnService, startRun } from '../demo/runs.ts';
import { askICode } from '../demo/ask-icode.ts';
import { now, tokens, uid, versionLabel, when } from '../demo/format.ts';
import { CapIcon, CardGrid, EmptyState, Fields, InfoTip, ItemCard, Section } from '../components/ui.tsx';
import { isDiagnosis, pendingCount } from '../demo/suggestions.ts';
import type { Toolbar } from './level.tsx';

function ResultTag({ t }: { t: Task }) {
  const tr = useT();
  if (t.status === 'running') return <Tag color="processing">{tr('tk.running')}</Tag>;
  if (!t.lastRun) return <Tag>{tr('tk.notRun')}</Tag>;
  if (t.status === 'failed') return <Tag color="error">{tr('tk.failed')}</Tag>;
  if (t.status === 'cancelled') return <Tag>{tr('tk.cancelled')}</Tag>;
  return <Tag color="success">{tr('tk.succeeded')}</Tag>;
}
const StatusTags = ({ t }: { t: Task }) => {
  const tr = useT();
  return <span className="tags"><ResultTag t={t} />{t.paused && t.status !== 'running' && <Tag color="warning">{tr('tk.paused')}</Tag>}</span>;
};
function sourceText(st: TalentsState, t: Task) {
  if (t.sessions) return currentT('tk.teamSessions', { count: t.sessions.length });
  const names = t.sources.map(id => source(st, id)?.name ?? currentT('tk.removedSource')).join(currentT('common.listSeparator'));
  return t.prs ? currentT('tk.withPrs', { names, count: t.prs.length }) : names;
}
function scheduleText(t: Task) {
  const s = t.schedule;
  if (s.kind === 'daily') {
    const base = t.cap === 'traj' ? currentT('tk.dailyTraj', { time: s.time })
      : t.skipUnchanged ? currentT('tk.dailySkip', { time: s.time }) : currentT('tk.daily', { time: s.time });
    return t.paused ? currentT('tk.withPaused', { text: base }) : base;
  }
  if (s.kind === 'once') return currentT('tk.onceAt', { at: s.at.replace('T', ' ') });
  return currentT('tk.now');
}
const isDaily = (t: Task) => t.schedule.kind === 'daily';
/** A one-off task that has run (succeeded, failed or was cancelled) is done; a daily task never is. */
const isDone = (t: Task) => t.status !== 'running' && !isDaily(t) && !!t.lastRun;
function nextRun(t: Task) {
  if (t.status === 'running') return '';
  if (t.schedule.kind === 'daily') return t.paused ? currentT('tk.pausedNoAuto') : currentT(now().slice(11) < t.schedule.time ? 'tk.today' : 'tk.tomorrow', { time: t.schedule.time });
  if (t.schedule.kind === 'once') return t.schedule.at.replace('T', ' ').slice(5);
  return '';
}
function modeText(st: TalentsState, t: Task) {
  if (t.mode !== 'update') return currentT('tk.build');
  if (!t.input) return currentT('tk.updateExisting');
  return source(st, t.sources[0])?.type === 'docs'
    ? currentT('tk.updateDocs', { from: versionLabel(t.input.from), to: versionLabel(t.input.to) })
    : currentT('tk.updateCommits', { from: t.input.from, to: t.input.to });
}
const lastRunText = (t: Task) => {
  const at = when(t.lastRun);
  const cancelled = t.status === 'cancelled' ? currentT('tk.cancelledRun', { time: at }) : at;
  return t.duration ? currentT('tk.withDuration', { time: cancelled, duration: t.duration }) : cancelled;
};
const paramText = (v: string | number | boolean | string[]) => Array.isArray(v) ? v.join(currentT('common.listSeparator')) : typeof v === 'boolean' ? (v ? currentT('tk.yes') : currentT('tk.no')) : String(v);
function contextText(st: TalentsState, t: Task) {
  const c = t.context; if (!c) return null;
  const skills = c.skills.map(id => st.projects.flatMap(p => p.skills).find(s => s.id === id)?.name ?? id), docs = c.docs.map(id => source(st, id)?.name ?? id);
  const parts = [
    skills.length && currentT('tk.ctxSkills', { list: skills.join(currentT('common.listSeparator')) }),
    docs.length && currentT('tk.ctxDocs', { list: docs.join(currentT('common.listSeparator')) }),
    c.note && currentT('tk.ctxNote', { note: c.note }),
  ].filter(Boolean);
  return parts.length ? parts.join('；') : null;
}

/** Run, cancel, pause and delete, shared by the cards and the detail. Cancelling and deleting ask first. */
function useTaskActions() {
  const { state: st, update, toast, startCodegraph } = useTalents();
  const { modal } = App.useApp();
  const tr = useT();
  const me = member(st, st.team.me)?.name ?? tr('tk.admin');
  return {
    run(id: string) {
      if (runsOnService(task(st, id)!.cap)) { startCodegraph(id).then(() => toast(tr('tk.buildStarted')), e => toast(tr('tk.buildFailed', { error: (e as Error).message }))); return; }
      update(d => startRun(d, task(d, id)!)); toast(tr('tk.started'));
    },
    cancel(id: string) {
      const t = task(st, id)!;
      modal.confirm({ title: tr('tk.cancelTitle'), okText: tr('tk.cancelOk'), okButtonProps: { danger: true }, cancelText: tr('tk.cancelKeep'),
        content: isDaily(t) ? tr('tk.cancelBodyDaily') : tr('tk.cancelBodyOnce'),
        onOk: () => { update(d => { const x = task(d, id); if (x?.status === 'running') cancelRun(x, me); }); toast(tr('tk.cancelledToast')); } });
    },
    pause(id: string, paused: boolean) {
      update(d => { task(d, id)!.paused = paused; });
      toast(paused ? tr('tk.pausedToast') : tr('tk.resumedToast'));
    },
    remove(id: string, onDone?: () => void) {
      const t = task(st, id)!;
      modal.confirm({ title: tr('tk.removeTitle', { name: taskName(st, t) }), okText: tr('tk.removeOk'), okButtonProps: { danger: true }, cancelText: tr('common.cancel'),
        content: t.lastRun ? (isDaily(t) ? tr('tk.removeBodyWithRun') : tr('tk.removeBodyOneOff')) : tr('tk.removeNever'),
        onOk: () => { update(d => { d.tasks = d.tasks.filter(x => x.id !== id); }); onDone?.(); toast(tr('tk.removed')); } });
    },
  };
}

export function LevelTasks({ pid, toolbar }: { pid: string | null; toolbar: Toolbar }) {
  const { state: st, route, replace, go, toast, clock } = useTalents();
  const t = useT();
  const actions = useTaskActions();
  const [tab, setTab] = useState<'current' | 'done'>('current'), [cat, setCat] = useState('all');
  const [form, setForm] = useState<Preset | null>(null), [detail, setDetail] = useState<string | null>(null);
  // ?new=1 (with cap / source / from) opens the form, ?open=<task> the detail; then the address drops them.
  useEffect(() => {
    const p = route.params;
    if (p.new) { setForm({ cap: p.cap, source: p.source, from: p.from }); replace(levelHash(pid, 'tasks')); }
    else if (p.open) { setDetail(p.open); replace(levelHash(pid, 'tasks')); }
  }, [route, replace, pid]);

  const run = (id: string) => { actions.run(id); setTab('current'); };
  const mine = st.tasks.filter(t => t.projectId === pid);
  const tasks = mine.filter(t => cat === 'all' || capability(st, t.cap)?.cat === cat);
  const byActivity = (a: Task, b: Task) => (a.status === 'running') !== (b.status === 'running') ? (a.status === 'running' ? -1 : 1) : (a.created ?? '') < (b.created ?? '') ? 1 : -1;
  const daily = tasks.filter(t => isDaily(t)).sort(byActivity), oneOff = tasks.filter(t => !isDaily(t) && !isDone(t)).sort(byActivity);
  const done = tasks.filter(isDone).sort((a, b) => (a.lastRun ?? '') < (b.lastRun ?? '') ? 1 : -1);
  const doneCount = mine.filter(isDone).length;
  const produced = (row: Task) => {
    const a = artifact(st, row.produced ?? row.artifact);
    const state = a && (isDiagnosis(a) ? (pendingCount(a) ? t('rv.suggestionsPending', { count: pendingCount(a) }) : t('ui.suggestionsHandled')) : a.draft ? t('ui.draft') : t('tk.publishedVersion', { version: a.published!.version }));
    return a && [t('tk.produced'), <><a onClick={e => { e.stopPropagation(); go(levelHash(pid, 'review', { id: a.id })); }}>{a.name}</a>（{state}）</>] as [string, ReactNode];
  };
  const card = (row: Task) => {
    const cap = capability(st, row.cap), running = row.status === 'running', p = running ? runProgress(row, clock) : null;
    // A CodeGraph build is not cancelled: stopping codegraph midway can leave an index it refuses to update.
    const buttons = running ? !row.run?.live && <Button size="small" danger onClick={() => actions.cancel(row.id)}>{t('tk.cancelRun')}</Button>
      : isDaily(row) ? <><PauseButton t={row} size="small" onClick={() => actions.pause(row.id, !row.paused)} /><Button size="small" onClick={() => run(row.id)}>{t('tk.runDailyOnce')}</Button></>
      : isDone(row) ? <Button size="small" onClick={() => setForm({ copy: row.id })}>{t('tk.copyTask')}</Button>
      : <Button size="small" onClick={() => run(row.id)}>{t('tk.runNow')}</Button>;
    return <ItemCard key={row.id} icon={<CapIcon cap={cap} />} title={taskName(st, row)} extra={<StatusTags t={row} />} onClick={() => setDetail(row.id)} actions={buttons}
      className={row.paused && !running ? 'is-paused' : undefined}>
      <Fields rows={isDone(row)
        ? [[t('tk.source'), sourceText(st, row)], [t('tk.ranAt'), lastRunText(row)], produced(row)]
        : [[t('tk.source'), sourceText(st, row)], [t('tk.time'), scheduleText(row)], !running && !!nextRun(row) && [t('tk.nextRun'), nextRun(row)], !running && !!row.lastRun && [t('tk.lastRun'), lastRunText(row)], !running && !!row.lastRun && produced(row)]} />
      {p && <><Progress percent={p.pct} showInfo={false} size="small" /><p className="caption run-step"><span>{row.run!.plan.steps[p.step]}…</span><span>{p.step + 1}/{row.run!.plan.steps.length}</span></p></>}
    </ItemCard>;
  };
  return <>
    {toolbar(<Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({})}>{t('tk.newTask')}</Button>)}
    <div className="toolbar">
      <Segmented value={tab} onChange={v => setTab(v as typeof tab)} options={[{ value: 'current', label: t('tk.tabCurrent', { count: mine.length - doneCount }) }, { value: 'done', label: t('tk.tabDone', { count: doneCount }) }]} />
      <span className="spacer" />
      <Segmented value={cat} onChange={v => setCat(v as string)} options={[{ value: 'all', label: t('tk.allCaps') }, ...st.categories.map(c => ({ value: c.id, label: c.name }))]} />
    </div>
    {tab === 'current'
      ? daily.length || oneOff.length ? <>
        {daily.length > 0 && <Section title={t('tk.dailyTasks')} note={daily.length}><CardGrid>{daily.map(card)}</CardGrid></Section>}
        {oneOff.length > 0 && <Section title={t('tk.oneOffTasks')} note={oneOff.length}><CardGrid>{oneOff.map(card)}</CardGrid></Section>}
      </> : <EmptyState>{t('tk.emptyCurrent')}</EmptyState>
      : done.length ? <CardGrid>{done.map(card)}</CardGrid> : <EmptyState>{t('tk.emptyDone')}</EmptyState>}
    {detail && task(st, detail) && <TaskDetail id={detail} onClose={() => setDetail(null)} onRun={() => run(detail)} onCopy={() => { setDetail(null); setForm({ copy: detail }); }} />}
    {form && <TaskForm level={pid} preset={form} onClose={() => setForm(null)} onCreated={(id, started) => { setTab('current'); setForm(null); if (started) setDetail(id); else toast(t('tk.created')); }} />}
  </>;
}

// ---------- Detail ----------
/** Pausing is shown in the warning colour (like other reversible destructive actions); resuming is ordinary. */
const PauseButton = ({ t, size, onClick }: { t: Task; size?: 'small'; onClick(): void }) => {
  const tr = useT();
  return t.paused ? <Button size={size} onClick={onClick}>{tr('tk.resume')}</Button> : <Button size={size} className="btn-warning" onClick={onClick}>{tr('tk.pause')}</Button>;
};

function TaskDetail({ id, onClose, onRun, onCopy }: { id: string; onClose(): void; onRun(): void; onCopy(): void }) {
  const { state: st, go, clock } = useTalents();
  const actions = useTaskActions();
  const tr = useT();
  const log = useRef<HTMLPreElement>(null);
  const t = task(st, id)!, cap = capability(st, t.cap), running = t.status === 'running';
  const p = running ? runProgress(t, clock) : null;
  const a = artifact(st, t.produced ?? t.artifact);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; });
  const outcome = a && (isDiagnosis(a) ? tr('tk.outcomeDiagnosis', { suggestions: (a.suggestions ?? []).length, pending: pendingCount(a) })
    : !a.draft ? (t.unchanged ? tr('tk.outcomeUnchanged', { version: a.published!.version })
      : a.published!.auto ? tr('tk.outcomeAuto', { version: a.published!.version }) : tr('tk.outcomeVersion', { version: a.published!.version }))
    : a.published ? tr('tk.outcomeUpdate') : tr('tk.outcomeNew'));
  return <Drawer open width={560} onClose={onClose} title={<div><div className="caption">{cap.name}</div>{taskName(st, t)}</div>}
    footer={<div className="drawer-foot">{running ? <><span className="spacer" />{!t.run?.live && <Button danger onClick={() => actions.cancel(t.id)}>{tr('tk.cancelRun')}</Button>}</> : <>
      <Button danger onClick={() => actions.remove(t.id, onClose)}>{tr('tk.delete')}</Button><span className="spacer" />
      {isDaily(t) && <PauseButton t={t} onClick={() => actions.pause(t.id, !t.paused)} />}
      {isDone(t) ? <Button onClick={onCopy}>{tr('tk.copyTask')}</Button> : <Button onClick={onRun}>{isDaily(t) ? tr('tk.runDailyOnce') : tr('tk.runNow')}</Button>}
      {a?.draft && t.status !== 'cancelled' && <Button type="primary" onClick={() => { onClose(); go(levelHash(a.projectId, 'review', { id: a.id })); }}>{isDiagnosis(a) ? tr('rv.viewSuggestions') : tr('tk.goReview')}</Button>}</>}</div>}>
    <div className="form-body">
      {t.paused && !running && <Alert type="warning" showIcon title={tr('tk.pausedAlert')} />}
      <Fields rows={[[tr('tk.capability'), cap.name], [tr('tk.source'), <>{sourceText(st, t)}{t.sessions && <Collapse ghost size="small" items={[{ key: 's', label: tr('tk.viewSessions'), children: <ul className="file-lines">{t.sessions.map(sid => <li key={sid}>{session(st, sid)?.title ?? sid}</li>)}</ul> }]} />}</>],
        !!contextText(st, t) && [tr('tk.context'), contextText(st, t)],
        !!t.prs && ['PR', t.prs.map(n => '#' + n).join(tr('common.listSeparator'))],
        ...Object.entries(t.params ?? {}).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, paramText(v)] as [string, string]),
        !!cap.update && [tr('tk.mode'), modeText(st, t)], [tr('tk.time'), scheduleText(t)], [tr('tk.status'), <StatusTags t={t} />]]} />
      {p ? <>
        <div className="field"><span className="label">{tr('tk.progress')} <span className="section-count">{p.pct}%</span></span><Progress percent={p.pct} showInfo={false} size="small" />
          <Steps size="small" direction="vertical" current={p.step} items={t.run!.plan.steps.map(title => ({ title }))} /></div>
        <div className="field"><span className="label">{tr('tk.log')}</span><pre className="log" ref={log}>{p.logs.join('\n')}</pre></div>
      </> : <>
        {a && t.status !== 'cancelled' && <div className="produced"><div className="caption">{tr('tk.producedThis')}</div><b>{a.name}</b><span>{outcome}</span></div>}
        {t.status === 'success' && !a && cap.outputPath && <div className="produced"><div className="caption">{tr('tk.producedThis')}</div><b className="path">{cap.outputPath}</b></div>}
        <div className="field"><span className="label">{tr('tk.lastRunField')}</span><p>{t.lastRun ? lastRunText(t) : tr('tk.neverRun')}</p></div>
        {t.lastRun && <Collapse size="small" items={[{ key: 'log', label: tr('tk.log'), children: <pre className="log">{(t.lastLogs ?? runPlan(st, t).logs.filter(Boolean)).join('\n')}</pre> }]} />}
      </>}
    </div>
  </Drawer>;
}

// ---------- Selection dialogs ----------
function SessionPicker({ level, initial, onDone, onClose }: { level: string | null; initial: string[]; onDone(ids: string[]): void; onClose(): void }) {
  const { state: st } = useTalents();
  const t = useT();
  const all = levelSessions(st, level);
  const [selected, setSelected] = useState(() => new Set(initial));
  const [q, setQ] = useState(''), [member, setMember] = useState('all'), [inProject, setInProject] = useState('all'), [prompt, setPrompt] = useState('');
  const [ai, setAi] = useState<{ ids: string[]; answer: string } | null>(null), [busy, setBusy] = useState(false);
  // Example requests follow the Teams data: a member who shared sessions, other than the person viewing.
  const sharer = st.team.members.filter(m => m.id !== st.team.admin && all.some(s => s.owner === m.id))[1];
  const examples = [t('tk.exSessions50'), t('tk.exSessionsCashback'), ...(sharer ? [t('tk.exSharedBy', { name: sharer.name })] : [])];
  const base = ai ? ai.ids.map(id => session(st, id)!).filter(Boolean) : all;
  const visible = base.filter(s => (member === 'all' || s.owner === member) && (inProject === 'all' || s.projectId === inProject) && (!q.trim() || s.title.toLowerCase().includes(q.trim().toLowerCase()) || s.id.includes(q.trim())));
  const ask = (text: string) => {
    if (!text.trim()) return;
    setPrompt(text); setBusy(true); setQ(''); setMember('all'); setInProject('all');
    setTimeout(() => { setAi(askICode(st, text, all)); setBusy(false); }, 1400 + Math.random() * 800);
  };
  const toggle = (ids: string[], on: boolean) => setSelected(prev => { const next = new Set(prev); ids.forEach(id => on ? next.add(id) : next.delete(id)); return next; });
  return <Modal open width={1000} title={t('tk.pickSessions')} onCancel={onClose} className="picker-modal"
    footer={<div className="drawer-foot"><span>{t('tk.selected')} <b>{selected.size}</b></span><Button type="link" onClick={() => setSelected(new Set())}>{t('tk.clear')}</Button><span className="spacer" />
      <Button onClick={onClose}>{t('common.cancel')}</Button><Button type="primary" disabled={!selected.size} onClick={() => { onDone(all.filter(s => selected.has(s.id)).map(s => s.id)); onClose(); }}>{t('common.confirm')}</Button></div>}>
    <div className="form-body">
      <div className="ai-box"><div className="ai-title"><StarOutlined /> {t('tk.aiFilterTitle')}</div>
        <Space.Compact style={{ width: '100%' }}><Input value={prompt} onChange={e => setPrompt(e.target.value)} onPressEnter={() => ask(prompt)} placeholder={t('tk.aiPlaceholder')} /><Button type="primary" loading={busy} onClick={() => ask(prompt)}>{busy ? t('tk.filtering') : t('tk.filter')}</Button></Space.Compact>
        <div className="ai-examples">{examples.map(x => <Button key={x} size="small" onClick={() => ask(x)}>{x}</Button>)}</div>
      </div>
      {ai && !busy && <Alert type="info" className="ai-answer" title={<><b>{t('tk.aiLabel')}</b>{ai.answer}</>} action={<Space>{ai.ids.length > 0 && <Button size="small" onClick={() => toggle(ai.ids, true)}>{t('tk.selectAll')}</Button>}<Button size="small" type="link" onClick={() => setAi(null)}>{t('tk.showAllSessions')}</Button></Space>} />}
      <div className="picker-search">
        {level === null && <Select style={{ width: 160 }} aria-label={t('tk.project')} value={inProject} onChange={setInProject} options={[{ value: 'all', label: t('tk.allProjects') }, ...st.projects.map(p => ({ value: p.id, label: p.name }))]} />}
        <Select showSearch optionFilterProp="label" style={{ width: 140 }} aria-label={t('tk.member')} value={member} onChange={setMember} options={[{ value: 'all', label: t('tk.allMembers') }, ...st.team.members.map(m => ({ value: m.id, label: m.name }))]} />
        <Input.Search allowClear value={q} onChange={e => setQ(e.target.value)} placeholder={t('tk.searchSessions')} />
      </div>
      <Table<Session> size="small" rowKey="id" pagination={false} scroll={{ y: 360 }} dataSource={busy ? [] : visible} loading={busy && { tip: t('tk.filteringTip') }}
        locale={{ emptyText: busy ? ' ' : t('tk.noMatchingSessions') }}
        rowSelection={{ selectedRowKeys: [...selected], onSelect: (s, on) => toggle([s.id], on), onSelectAll: on => toggle(visible.map(s => s.id), on) }}
        onRow={s => ({ onClick: () => toggle([s.id], !selected.has(s.id)), className: 'row-click' })}
        columns={[
          { title: t('tk.name'), dataIndex: 'title' },
          ...(level === null ? [{ title: t('tk.project'), width: 130, ellipsis: true, render: (_: unknown, s: Session) => project(st, s.projectId)?.name ?? s.projectId }] : []),
          { title: t('tk.member'), width: 90, render: (_, s) => memberName(st, s.owner, s.ownerName) },
          { title: t('tk.lastUpdated'), width: 110, render: (_, s) => when(s.updated) },
          { title: t('tk.turns'), dataIndex: 'turns', align: 'right', width: 90 },
          { title: t('tk.messages'), dataIndex: 'messages', align: 'right', width: 70 },
          { title: 'Token', align: 'right', width: 90, render: (_, s) => tokens(s.tokens) },
        ]} />
    </div>
  </Modal>;
}

function PrPicker({ repoId, initial, onDone, onClose }: { repoId: string; initial: number[]; onDone(list: number[]): void; onClose(): void }) {
  const { state: st } = useTalents();
  const t = useT();
  const [selected, setSelected] = useState(() => new Set(initial)), [q, setQ] = useState('');
  const s = q.trim().toLowerCase().replace(/^#/, '');
  const list = (st.prs[repoId] ?? []).slice().reverse().filter(p => !s || String(p.number).startsWith(s) || p.title.toLowerCase().includes(s));
  const toggle = (n: number) => setSelected(prev => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  return <Modal open title={t('tk.pickPrs')} onCancel={onClose}
    footer={<div className="drawer-foot"><span>{t('tk.selected')} <b>{selected.size}</b></span><span className="spacer" /><Button onClick={onClose}>{t('common.cancel')}</Button>
      <Button type="primary" disabled={!selected.size} onClick={() => { onDone([...selected].sort((a, b) => a - b)); onClose(); }}>{t('common.confirm')}</Button></div>}>
    <div className="form-body">
      <Input.Search allowClear value={q} onChange={e => setQ(e.target.value)} placeholder={t('tk.searchPrs')} />
      <Table size="small" rowKey="number" pagination={false} showHeader={false} scroll={{ y: 'min(420px, 55vh)' }} dataSource={list} locale={{ emptyText: t('tk.noMatchingPrs') }}
        rowSelection={{ selectedRowKeys: [...selected], onSelect: p => toggle(p.number), hideSelectAll: true }}
        onRow={p => ({ onClick: () => toggle(p.number), className: 'row-click' })}
        columns={[{ render: (_, p) => <b>#{p.number}</b>, width: 60 }, { dataIndex: 'title' }, { dataIndex: 'merged', width: 100, className: 'caption' }]} />
    </div>
  </Modal>;
}

// ---------- Form ----------
/** copy: a task whose settings the form starts from (复制为新任务); its name and time are not copied. */
interface Preset { cap?: string; source?: string; from?: string; copy?: string }
/** level: the team (null) or project the task belongs to; undefined lets the user choose (from 知识能力). */
export function TaskForm({ level: fixed, preset, onClose, onCreated }: { level?: string | null; preset: Preset; onClose(): void; onCreated(id: string, started: boolean, level: string | null): void }) {
  const { state: st, update, focusProject, startCodegraph, toast, teamsLink } = useTalents();
  const t = useT();
  // "重新提取" on an artifact: start from the task that built it.
  const fromArtifact = artifact(st, preset.from);
  const copied = task(st, preset.copy);
  const fromTask = copied ?? (fromArtifact ? st.tasks.find(t => (t.produced ?? t.artifact) === fromArtifact.id) : undefined);
  const presetSource = source(st, copied ? copied.sources[0] : fromArtifact ? fromArtifact.sources[0] : preset.source);
  const [capId, setCapId] = useState(copied?.cap ?? fromArtifact?.cap ?? preset.cap ?? (presetSource ? (presetSource.type === 'repo' ? 'miner-pr' : 'doc-extract') : 'traj'));
  const [chosen, setChosen] = useState<string | null>(presetSource?.id ?? null);
  // Chosen in the form only when not given: start with the project the user came for.
  const [level, setLevel] = useState<string | null>(fixed !== undefined ? fixed : focusProject ?? st.projects[0]?.id ?? null);
  const [prs, setPrs] = useState<number[]>(copied?.prs ?? []), [sessions, setSessions] = useState<string[]>(copied?.sessions ?? []);
  const [schedule, setSchedule] = useState<'now' | 'once' | 'daily'>('now'), [mode, setMode] = useState<'update' | 'build'>(copied?.mode ?? 'update');
  const [at, setAt] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T09:00'), [time, setTime] = useState('02:00'), [skip, setSkip] = useState(true);
  const [name, setName] = useState(''), [agentId, setAgentId] = useState(fromTask?.agent ?? st.agents[0]?.id);
  const cap: Capability = capability(st, capId);
  const [prompt, setPrompt] = useState(fromTask?.prompt ?? cap.prompt ?? '');
  const [scenario, setScenario] = useState(''), [snippets, setSnippets] = useState('');
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => Object.fromEntries(Object.entries(copied?.params ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : v])));
  const [ctxSkills, setCtxSkills] = useState<string[]>(copied?.context?.skills ?? []), [ctxDocs, setCtxDocs] = useState<string[]>(copied?.context?.docs ?? []), [ctxNote, setCtxNote] = useState(copied?.context?.note ?? '');
  const [picking, setPicking] = useState<'sessions' | 'prs' | null>(null);

  // A CodeGraph build runs now, in the repository as it is: it has no schedule and no update/rebuild choice.
  const onService = runsOnService(capId);
  // Repositories not yet bound to a local directory in Teams are listed but cannot be chosen; once bound in Teams they
  // become choosable here without reopening the form.
  const own = levelSources(st, level);
  const listed = cap.input === 'docs' ? own.filter(s => s.type === 'docs') : own.filter(s => s.type === 'repo' && (cap.input !== 'repo+pr' || s.prs));
  const pool = listed.filter(s => s.type === 'docs' || s.bound), unbound = listed.filter(s => s.type === 'repo' && !s.bound);
  const src = cap.input === 'sessions' ? 's-sessions' : pool.some(s => s.id === chosen) ? chosen : pool[0]?.id ?? null;
  // Update vs rebuild: only when the capability declares an update and this input already has knowledge.
  const modeInfo = (() => {
    if (!cap.update || !src || cap.input === 'sessions' || onService) return null;
    const a = existingArtifact(st, { projectId: level, cap: capId, sources: [src] }), basis = a && basisOf(a);
    return basis ? { artifact: a!, changes: changesSince(source(st, src), basis) } : null;
  })();

  let ok = !!src, hint = src ? '' : unbound.length ? t('tk.unboundRepo') : t('tk.noLevelSource', { level: levelName(st, level), kind: cap.input === 'docs' ? t('lv.docs') : cap.input === 'repo+pr' ? t('tk.repoWithPrs') : t('lv.repo') });
  if (modeInfo && mode === 'update' && schedule !== 'daily' && modeInfo.changes && !modeInfo.changes.count) { ok = false; hint = t('tk.noChanges'); }
  if (cap.input === 'sessions') { ok = sessions.length > 0; hint = ok ? '' : t('tk.selectSessions'); }
  if (cap.input === 'repo+pr' && src) { ok = prs.length > 0; hint = ok ? '' : t('tk.selectPrs'); }
  if (cap.input === 'repo+snippet' && src) { ok = !!scenario.trim() && !!snippets.trim(); hint = ok ? '' : t('tk.fillSnippet'); }
  const missing = (cap.params ?? []).find(p => p.required && p.type !== 'boolean' && !String(values[p.name] ?? '').trim());
  if (ok && missing) { ok = false; hint = t('tk.fillParam', { name: missing.name }); }
  // Supporting material for a diagnosis: the level's project skills and document sets.
  const levelSkills = (level ? st.projects.filter(p => p.id === level) : st.projects).flatMap(p => p.skills);

  const changeCap = (id: string) => { setCapId(id); setPrs([]); setValues({}); setPrompt(capability(st, id).prompt ?? ''); };
  const changeLevel = (id: string | null) => { setLevel(id); setChosen(null); setPrs([]); setSessions([]); setCtxSkills([]); setCtxDocs([]); };
  const submit = () => {
    const id = uid('t');
    const next: Task = {
      id, projectId: level, name: name.trim(), cap: capId, sources: [src!], created: now(), status: 'idle',
      mode: modeInfo ? mode : 'build', prompt: cap.skill ? prompt : undefined,
      schedule: schedule === 'daily' ? { kind: 'daily', time: time || '02:00' } : schedule === 'once' ? { kind: 'once', at } : { kind: 'now' },
    };
    if (cap.input === 'sessions') next.sessions = sessions.slice();
    if (cap.input === 'repo+pr') next.prs = prs.slice();
    if (cap.params?.length) next.params = Object.fromEntries(cap.params.map(p => [p.name, p.type === 'array' ? String(values[p.name] ?? '').split('\n').map(x => x.trim()).filter(Boolean) : values[p.name] ?? (p.type === 'boolean' ? false : '')]));
    if (cap.input === 'sessions' && (ctxSkills.length || ctxDocs.length || ctxNote.trim())) next.context = { skills: ctxSkills, docs: ctxDocs, note: ctxNote.trim() || undefined };
    if (next.schedule.kind === 'daily' && cap.input !== 'sessions') next.skipUnchanged = skip;
    if (onService) {
      next.schedule = { kind: 'now' }; delete next.skipUnchanged;
      update(d => { d.tasks.unshift(next); });
      startCodegraph(id).catch(e => toast(t('tk.buildFailed', { error: (e as Error).message })));
      onCreated(id, true, level); return;
    }
    update(d => { d.tasks.unshift(next); if (schedule === 'now') startRun(d, d.tasks[0]); });
    onCreated(id, schedule === 'now', level);
  };
  const pickRow = (text: string, label: string, empty: boolean, onPick: () => void) =>
    <div className={'pick-summary' + (empty ? ' empty' : '')}><span>{text}</span><Button size="small" onClick={onPick}>{label}</Button></div>;
  const changeNote = modeInfo && (() => {
    const c = modeInfo.changes, docs = source(st, src)!.type === 'docs';
    const detail = c && c.count ? (docs ? versionLabel(c.from) + ' → ' + versionLabel(c.to) + '，' : '') + c.text : '';
    return c && c.count ? t(docs ? 'tk.changeDocsYes' : 'tk.changeCodeYes', { detail }) : t(docs ? 'tk.changeDocsNo' : 'tk.changeCodeNo');
  })();

  return <Drawer open width={560} title={fixed === undefined ? t('tk.newTask') : <div><div className="caption">{levelName(st, level)}</div>{copied ? t('tk.copyTask') : t('tk.newTask')}</div>} onClose={onClose}
    footer={<div className="drawer-foot"><span className="ui-note">{hint}</span><span className="spacer" /><Button onClick={onClose}>{t('common.cancel')}</Button><Button type="primary" disabled={!ok} onClick={submit}>{schedule === 'now' ? t('tk.createAndRun') : t('tk.create')}</Button></div>}>
    <div className="form-body">
      {fixed === undefined && <div className="field"><span className="label">{t('tk.belongsTo')} <InfoTip>{t('tk.belongsToTip')}</InfoTip></span>
        <Select value={level ?? ''} onChange={v => changeLevel(v || null)} options={[{ value: '', label: t('tnav.team') }, ...st.projects.map(p => ({ value: p.id, label: p.name }))]} />
</div>}
      <div className="field"><span className="label">{t('tk.capability')} <InfoTip>{cap.desc}</InfoTip></span>
        <Select value={capId} onChange={changeCap} options={st.categories.map(c => ({ label: c.name, title: c.name, options: st.capabilities.filter(x => x.cat === c.id).map(x => ({ value: x.id, label: x.name })) }))} />
</div>
      <div className="field"><span className="label">{t('tk.source')}</span>
        {cap.input === 'sessions'
          ? pickRow(sessions.length ? t('tk.selectedSessions', { count: sessions.length }) : t('tk.noSessions'), t(sessions.length ? 'tk.reselect' : 'tk.pickSessionsCta'), !sessions.length, () => setPicking('sessions'))
          : <div className="stack">
            <Select value={src ?? undefined} onChange={v => { setChosen(v); setPrs([]); }} placeholder={unbound.length ? t('tk.unboundPlaceholder') : undefined}
              options={listed.map(s => s.type === 'repo' && !s.bound ? { value: s.id, disabled: true, label: <>{s.name}<span className="caption">{t('tk.unboundSuffix')}</span></> } : { value: s.id, label: s.name })} />
            {!src && unbound.length > 0 && level && <p className="ui-note">{t('tk.unboundNote', { names: unbound.map(s => s.name).join(t('common.listSeparator')) })}
              <a href={teamsLink(level) + '&workspace=settings'} target="_blank" rel="noreferrer">{t('tk.bindInTeams')}</a>{t('tk.bindAfterSave')}</p>}
            {cap.input === 'repo+pr' && pickRow(prs.length ? t('tk.selectedPrs', { count: prs.length, list: prs.map(n => '#' + n).join(t('common.listSeparator')) }) : t('tk.noPrs'), t(prs.length ? 'tk.reselect' : 'tk.pickPrsCta'), !prs.length, () => setPicking('prs'))}
            {cap.input === 'repo+snippet' && <><Input value={scenario} onChange={e => setScenario(e.target.value)} placeholder={t('tk.scenario')} />
              <Input.TextArea rows={2} value={snippets} onChange={e => setSnippets(e.target.value)} placeholder={t('tk.snippets')} /></>}
          </div>}
      </div>
      {cap.input === 'sessions' && <div className="field"><span className="label">{t('tk.context')} <InfoTip>{t('tk.contextTip')}</InfoTip></span>
        <Select mode="multiple" allowClear value={ctxSkills} onChange={setCtxSkills} placeholder={t(levelSkills.length ? 'tk.ctxSkillsPlaceholder' : 'tk.noProjectSkills')} disabled={!levelSkills.length}
          options={levelSkills.map(s => ({ value: s.id, label: s.name }))} />
        <Select mode="multiple" allowClear value={ctxDocs} onChange={setCtxDocs} placeholder={t('tk.ctxDocsPlaceholder')} options={own.filter(s => s.type === 'docs').map(s => ({ value: s.id, label: s.name }))} />
        <Input.TextArea rows={2} value={ctxNote} onChange={e => setCtxNote(e.target.value)} placeholder={t('tk.ctxNotePlaceholder')} /></div>}
      {(cap.params ?? []).length > 0 && <div className="field"><span className="label">{t('tk.params')}</span>
        {cap.params!.map(p => <label key={p.name} className="param-row"><span className="caption">{p.name}{p.required && <span className="required">*</span>}</span>
          {p.type === 'boolean' ? <Checkbox checked={!!values[p.name]} onChange={e => setValues(v => ({ ...v, [p.name]: e.target.checked }))} />
            : p.type === 'number' || p.type === 'integer' ? <InputNumber style={{ width: '100%' }} precision={p.type === 'integer' ? 0 : undefined} value={values[p.name] as number | undefined} onChange={x => setValues(v => ({ ...v, [p.name]: x ?? '' }))} />
            : p.type === 'array' ? <Input.TextArea rows={2} value={String(values[p.name] ?? '')} onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))} placeholder={t('tk.onePerLine')} />
            : <Input value={String(values[p.name] ?? '')} onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))} />}</label>)}
      </div>}
      {modeInfo && <div className="field"><span className="label">{t('tk.mode')}</span>
        <Radio.Group className="option-list" value={mode} onChange={e => setMode(e.target.value)}>
          <Radio value="update"><b>{t('tk.updateExisting')}</b><span className="caption">{changeNote}</span></Radio>
          <Radio value="build"><b>{t('tk.rebuild')}</b></Radio>
        </Radio.Group></div>}
      <div className="field"><span className="label">{t('tk.time')}{schedule === 'daily' && cap.input === 'sessions' && <> <InfoTip>{t('tk.dailySessionsTip')}</InfoTip></>}</span>
        <Select value={onService ? 'now' : schedule} onChange={setSchedule} disabled={onService} options={[{ value: 'now', label: t('tk.now') }, { value: 'once', label: t('tk.once') }, { value: 'daily', label: t('tk.dailyOption') }]} />
        {onService && <span className="caption">{t('tk.onServiceNote')}</span>}
        {schedule === 'once' && !onService && <Input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />}
        {schedule === 'daily' && !onService && <Input type="time" value={time} onChange={e => setTime(e.target.value)} />}
        {schedule === 'daily' && !onService && cap.input !== 'sessions' && <Checkbox checked={skip} onChange={e => setSkip(e.target.checked)}>{t('tk.skipUnchanged')}</Checkbox>}
      </div>
      <label className="field"><span className="label">{t('tk.name')}</span>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={taskName(st, { cap: capId, sources: src ? [src] : [], sessions: cap.input === 'sessions' ? sessions : undefined })} /></label>
      {cap.skill && <Collapse size="small" items={[{ key: 'adv', label: <>{t('tk.advanced')} <span className="caption">{t('tk.currentAgent', { name: st.agents.find(a => a.id === agentId)?.name ?? '' })}</span></>, children: <div className="form-body flush">
        <div className="field"><span className="label">{t('tk.agent')}</span><Select value={agentId} onChange={setAgentId} options={st.agents.map(a => ({ value: a.id, label: a.name }))} /></div>
        <div className="field"><span className="label">{t('tk.prompt')}</span><Input.TextArea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} /></div>
      </div> }]} />}
    </div>
    {picking === 'sessions' && <SessionPicker level={level} initial={sessions} onDone={setSessions} onClose={() => setPicking(null)} />}
    {picking === 'prs' && src && <PrPicker repoId={src} initial={prs} onDone={setPrs} onClose={() => setPicking(null)} />}
  </Drawer>;
}
