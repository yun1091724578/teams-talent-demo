// 轨迹洞察的诊断工作台。诊断不走审阅发布：左侧是诊断报告和各条优化建议，中间是报告或一条建议的内容，
// 右侧逐条提交改进 PR 或暂不采纳。Skill 建议修改项目 Skill 的文件；工具和任务指令建议向 AGENTS.md 补充规则。
import { useState } from 'react';
import { Button, Collapse, Input, Modal, Tag } from 'antd';
import { PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import type { Artifact, SuggestionState } from '../types.ts';
import { artifact, session } from '../demo/model.ts';
import { when } from '../demo/format.ts';
import { decline, kindLabel, pendingCount, priorityLabel, proposedRule, reopen, report, stateOf, type Report, type Suggestion } from '../demo/suggestions.ts';
import { SubmitDialog, SubmissionLink } from '../components/submit-pr.tsx';
import { ArtifactStatus, EmptyState, Fields } from '../components/ui.tsx';
import { DiffView, FileContent, FileList } from '../components/files.tsx';

const REPORT = 'report';
function StatusMark({ state }: { state: SuggestionState }) {
  const t = useT();
  if (state.status === 'submitted' || state.status === 'applied') return <Tag className="file-mark" bordered={false} color="success">{t('ui.prCreated')}</Tag>;
  if (state.status === 'declined') return <Tag className="file-mark" bordered={false}>{t('traj.decline')}</Tag>;
  return <Tag className="file-mark" bordered={false} color="warning">{t('ui.pendingSubmit')}</Tag>;
}

export function DiagnosisWorkbench({ id }: { id: string }) {
  const { state: st } = useTalents();
  const t = useT();
  const [item, setItem] = useState(REPORT);
  const a = artifact(st, id), r = report(a?.topic);
  if (!a || !r) return <EmptyState>{t('traj.notFound')}<a href="#/projects">{t('rv.backToProjects')}</a></EmptyState>;
  const picked = r.suggestions.find(s => s.id === item);
  return <div className="wb">
    <PageHeader title={a.name} description={t('traj.insight')} actions={<ArtifactStatus a={a} />} />
    <div className="wb-body">
      <FileList current={item} onSelect={setItem} groups={[
        { title: '', items: [{ key: REPORT, label: t('traj.report') }] },
        { title: t('traj.suggestions'), items: r.suggestions.map(s => ({ key: s.id, indent: true, label: <>{s.title}<StatusMark state={stateOf(a, s.id)} /></> })) },
      ]} />
      <section className="wb-main"><div className="wb-view" key={item}>
        {picked ? <SuggestionView a={a} s={picked} /> : <FileContent st={st} a={a} file={a.files![0]} text={null} />}
      </div></section>
      <aside className="wb-side"><div className="side-body">
        {picked ? <SuggestionSide a={a} s={picked} /> : <DiagnosisSide a={a} r={r} onOpen={setItem} />}
      </div></aside>
    </div>
  </div>;
}

function DiagnosisSide({ a, r, onOpen }: { a: Artifact; r: Report; onOpen(id: string): void }) {
  const { state: st } = useTalents();
  const t = useT();
  const sessions = (a.sessions ?? []).map(id => session(st, id)?.title ?? id).join(t('common.listSeparator'));
  return <>
    <h3>{t('traj.diagnosis')}</h3>
    <Fields rows={[[t('traj.sessions'), sessions], [t('traj.diagnosedAt'), when(a.draft?.created)], [t('traj.chains'), t('traj.chainsValue', { count: r.chains })], [t('traj.suggestions'), t('traj.suggestionsValue', { count: r.suggestions.length, pending: pendingCount(a) })]]} />
    <p className="caption">{t('traj.guide')}</p>
    <div className="suggestion-list">{r.suggestions.map(s => <a key={s.id} onClick={() => onOpen(s.id)}><span>{s.title}</span><StatusMark state={stateOf(a, s.id)} /></a>)}</div>
  </>;
}

function SuggestionView({ a, s }: { a: Artifact; s: Suggestion }) {
  const t = useT();
  const list = (label: string, items: string[]) => items.length > 0 && <div className="suggestion-section"><h3>{label}</h3><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
  const [main, ...supporting] = s.files;
  return <div className="suggestion">
    <header className="suggestion-head">
      <div className="suggestion-tags"><Tag color="purple">{kindLabel[s.kind]}</Tag><Tag color={s.priority === 'high' ? 'error' : s.priority === 'medium' ? 'warning' : 'default'}>{t('traj.priorityValue', { label: priorityLabel[s.priority] })}</Tag></div>
      <h2>{s.title}</h2>
    </header>
    <dl className="suggestion-story">
      {([[t('traj.background'), s.background], [t('traj.observation'), s.observation], [t('traj.goal'), s.goal]] as const).filter(([, text]) => text).map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}
    </dl>
    {s.kind === 'skill'
      ? <div className="suggestion-section"><h3>{t('traj.change')}</h3>{s.change && <p className="ui-note">{s.change}</p>}
        {s.files.map(f => <div className="suggestion-file" key={f.path}><code>{f.path}</code><DiffView before={f.before} after={f.after} /></div>)}</div>
      : <>
        <div className="suggestion-section"><h3>{t('traj.ruleHeading')}</h3><div className="rule-text">{proposedRule(a.topic, s.id)}</div></div>
        <Collapse size="small" items={[
          { key: 'origin', label: t('traj.originReport', { kind: s.kind === 'prompt' ? t('traj.originPrompt') : t('traj.originTool') }), children: <DiffView before={main.before} after={main.after} /> },
          ...supporting.map(f => ({ key: f.path, label: t('traj.supporting', { path: f.path }), children: <>{f.reason && <p className="ui-note">{f.reason}</p>}<DiffView before={f.before} after={f.after} /></> })),
        ]} />
      </>}
    <div className="suggestion-columns">{list(t('traj.risks'), s.risks)}{list(t('traj.validation'), s.validation)}</div>
  </div>;
}

function SuggestionSide({ a, s }: { a: Artifact; s: Suggestion }) {
  const { update, toast } = useTalents();
  const t = useT();
  const [declining, setDeclining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const state = stateOf(a, s.id);
  return <>
    <h3>{t('traj.submitHeading')}</h3>
    <p>{s.kind === 'skill' ? t('traj.skillTarget', { skill: s.skill ?? '' }) : t('traj.agentsTarget')}</p>
    <p className="caption">{t('traj.submitNote')}</p>
    {state.status === 'pending' ? <div className="actions">
      <Button type="primary" onClick={() => setSubmitting(true)}>{t('traj.submitPr')}</Button>
      <Button className="btn-warning" onClick={() => setDeclining(true)}>{t('traj.decline')}</Button>
    </div> : state.status === 'submitted' ? <SubmissionLink submission={state.submission!} />
      : state.status === 'declined' ? <><p>{t('traj.declinedWith', { reason: state.reason ?? t('traj.noReason') })}</p>
        <Button onClick={() => update(d => reopen(d, a, s.id))}>{t('traj.reconsider')}</Button></> : <p>{t('traj.history')}</p>}
    {submitting && <SubmitDialog a={a} suggestion={s} onClose={() => setSubmitting(false)} />}
    {declining && <DeclineDialog onClose={() => setDeclining(false)} onDone={reason => { update(d => decline(d, a, s.id, reason)); setDeclining(false); toast(t('traj.declinedToast')); }} />}
  </>;
}

function DeclineDialog({ onClose, onDone }: { onClose(): void; onDone(reason: string): void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  return <Modal open title={t('traj.declineTitle')} okText={t('traj.decline')} okButtonProps={{ className: 'btn-warning' }} cancelText={t('common.cancel')} onOk={() => onDone(reason)} onCancel={onClose}>
    <div className="form-body"><label className="field"><span className="label">{t('traj.reason')} <span className="caption">{t('traj.optional')}</span></span>
      <Input.TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('traj.reasonPlaceholder')} /></label></div>
  </Modal>;
}
