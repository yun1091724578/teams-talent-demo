import { preferredDeliveryTask, projectDeliveryTasks } from '../project-delivery-tasks.js';
import { requirementStageKeys } from '../delivery-requirements.js';
import { displayRequirementId } from '../display-text.js';
import { TaskSessions } from '../components/task-sessions.js';
import { displayText } from '../display-text.js';
import { TeamsPageIntro } from '../components/teams-reuse.js';
import { useState } from 'react';
import { Alert, Button, Descriptions, Empty, Space, Tabs, Tag, Timeline } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { Origin, talentLink } from '../components/common.js';
import { collectTaskSessions, mainTask, taskAutomation } from '../task-automation.js';
import '../operations.css';

// Status vocabularies are module-level, so getters keep `labels[key]`, Object.keys and Object.hasOwn
// working while every read still resolves against the ambient locale.
function labelGetters<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  return Object.defineProperties({} as Record<K, string>, Object.fromEntries(
    (Object.keys(keys) as K[]).map(key => [key, { get: () => currentT(keys[key]), enumerable: true }]),
  ));
}
const knowledgeLabels = labelGetters({ 'waiting-upstream': 'trace.knowledge.waitingUpstream', queued: 'trace.knowledge.queued', running: 'trace.knowledge.running', ready: 'trace.knowledge.ready', waiting: 'trace.knowledge.waiting', failed: 'trace.knowledge.failed' } as const);
const collectionLabels = labelGetters({ queued: 'trace.collection.queued', running: 'trace.collection.running', collected: 'trace.collection.collected', empty: 'trace.collection.empty', failed: 'trace.collection.failed' } as const);
const phaseLabels = labelGetters({ started: 'trace.phase.started', progress: 'trace.phase.progress', blocked: 'trace.phase.blocked', result: 'trace.phase.result' } as const);
const evidenceNotes: Record<string, string | undefined> = labelGetters({ E3: 'trace.evidence.firstCheck', E4: 'trace.evidence.fixNote', E5: 'trace.evidence.retest' } as const);

export function Trace({ initial }: { initial?: string }) {
  const { data, state, role } = useDemo();
  const t = useT();
  const [selected, setSelected] = useState(initial === 'security' ? 'security' : data.evidence.some(item => item.id === initial) ? initial! : 'E1');
  const [tab, setTab] = useState<'collaboration' | 'history'>(initial ? 'history' : 'collaboration');
  const params = new URLSearchParams(location.hash.split('?')[1] ?? ''), projectId = params.get('project') ?? 'carddemo';
  const tasks = projectDeliveryTasks(state, projectId, role), requested = params.get('task');
  const entry = requested ? tasks.find(item => item.id === requested) : preferredDeliveryTask(tasks, role), task = entry?.record;
  if (!task) return <Empty description={t('trace.noTask')} />;
  const scope = { projectId: task.projectId, taskId: task.id }, isMain = scope.projectId === 'carddemo' && scope.taskId === 'DEMO-MKT-001';
  const automation = taskAutomation(state, scope), collection = automation?.collection;
  const sessions = collectTaskSessions(state, scope);
  const collectionStatus = collection ? collectionLabels[collection.status] : task.stage === 'accepted' ? t('trace.collection.toCollect') : t('trace.collection.toAccept');
  const reporting = collection?.reporting;
  const talentStatus = reporting?.status === 'reported' ? t('trace.share.shared') : reporting?.status === 'failed' ? t('trace.share.failed') : reporting?.status === 'uploading' ? t('trace.share.uploading') : t('trace.share.notShared');
  const ownerName = state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '', memberName = state.workspace.team.members.find(item => item.id === 'member')?.name ?? '';
  const activity = [
    ...(state.workspace.collaboration?.events ?? []).filter(item => item.projectId === scope.projectId && item.taskId === scope.taskId).map(item => ({ id: 'event-' + item.id, text: item.summary, at: item.at, source: 'Teams CLI · ' + phaseLabels[item.phase], color: 'green', actor: item.role === 'owner' ? ownerName : memberName })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const evidence = data.evidence.find(item => item.id === selected);
  const selectEvidence = (id: string) => { setSelected(id); setTab('history'); };
  return <div className="page-stack trace-page" data-trace-task={task.id}>
    <TeamsPageIntro actions={role === 'owner' ? <Space wrap><Button href="#/team-work">{t('trace.backToWork')}</Button><Button href={talentLink('sessions')}>{t('trace.analyzeRecords')} <ArrowRightOutlined /></Button></Space> : <Button href={'#/' + entry!.route}>{t('trace.backToMyDelivery')}</Button>}>{displayRequirementId(task.id)} · {task.title}</TeamsPageIntro>
    <FrameworkCard title={t('trace.linkedDelivery')} action={<Tag color={task.stage === 'awaiting-acceptance' ? 'gold' : 'green'}>{t(requirementStageKeys[task.stage])}</Tag>}>
      <Descriptions size="small" column={2} items={[
        { key: 'project', label: t('trace.project'), children: projectId === 'carddemo' ? state.workspace.project.name : state.workspace.projects?.find(project => project.id === projectId)?.name ?? projectId }, { key: 'task', label: t('trace.requirement'), children: displayRequirementId(task.id) },
        { key: 'context', label: t('trace.adoptedContext'), children: task.preparedAt ? t('trace.adoptedAt', { at: new Date(task.preparedAt).toLocaleString('zh-CN') }) : t('trace.awaitingAdoption') }, { key: 'sessions', label: t('trace.sessions'), children: t('trace.sessionCount', { count: sessions.length }) },
        { key: 'collection', label: t('trace.collectionLabel'), children: collectionStatus }, { key: 'talent', label: t('trace.shareLabel'), children: talentStatus },
      ]} />
      <Space wrap><Button href={'#/' + entry!.route}>{t('trace.openDelivery')}</Button></Space>
      <p className="muted">{t('trace.scopeNote')}</p>
    </FrameworkCard>
    <Tabs activeKey={isMain ? tab : 'collaboration'} onChange={value => setTab(value as 'collaboration' | 'history')} items={[
      { key: 'collaboration', label: t('trace.tab.collaboration'), children: <div className="page-stack">
        <div className="trace-current-grid"><TaskSessions readonly scope={scope} /><FrameworkCard title={t('trace.automation.title')} action={<Tag>{t('trace.automation.tag')}</Tag>}>
          <Descriptions column={1} size="small" items={[
            { key: 'knowledge', label: t('trace.automation.knowledge'), children: automation?.knowledge ? knowledgeLabels[automation.knowledge.status] : t('trace.automation.notTriggered') },
            { key: 'collection', label: t('trace.collectionLabel'), children: collectionStatus },
            { key: 'talent', label: t('trace.shareLabel'), children: reporting?.status === 'reported' ? t('trace.share.sharedWith', { receipt: reporting.receipt?.id ?? '' }) : talentStatus },
            { key: 'sessions', label: t('trace.automation.collectedSessions'), children: t('trace.sessionCount', { count: (collection?.sessions ?? sessions).length }) },
          ]} />
          {automation?.knowledge?.error && <Alert type="error" title={t('trace.automation.knowledgeFailed')} description={automation.knowledge.error} />}
          {collection?.error && <Alert type="error" title={t('trace.automation.collectionFailed')} description={collection.error} />}
          {reporting?.status === 'failed' && <Alert type="error" title={t('trace.automation.shareFailed')} description={reporting.reason} />}
          <p className="muted">{t('trace.automation.note')}</p>
        </FrameworkCard></div>
        <FrameworkCard title={t('trace.activity.title')} action={<Tag>{t('trace.activity.count', { count: activity.length })}</Tag>}>
          {activity.length ? <Timeline items={activity.map(item => ({ key: item.id, color: item.color, title: <Space wrap><Tag color={item.color}>{item.source}</Tag><strong>{displayText(item.text)}</strong></Space>, content: <small className="muted">{item.actor} · {new Date(item.at).toLocaleString('zh-CN', { hour12: false })}</small> }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('trace.activity.empty')} />}
        </FrameworkCard>
      </div> },
      ...(isMain ? [{ key: 'history', label: t('trace.tab.history'), children: <div className="page-stack">
        <section className="trace-material-summary"><div><span className="trace-section-label">{t('trace.history.label')}</span><h3>{t('trace.history.title')}</h3><p>{t('trace.history.scenario')}</p></div><Space wrap><Button onClick={() => selectEvidence('E3')}>{t('trace.history.firstCheck')}</Button><Button onClick={() => selectEvidence('E4')}>{t('trace.history.fixNote')}</Button><Button onClick={() => selectEvidence('E5')}>{t('trace.history.retest')}</Button></Space><Tag color="gold">{t('trace.history.securityPending')}</Tag></section>
        <div className="trace-layout"><FrameworkCard title={t('trace.materials.title')} action={<Origin kind="historical" />}><p className="muted">{t('trace.materials.note')}</p><div className="evidence-nav">{data.evidence.map(item => <button key={item.id} aria-pressed={selected === item.id} className={selected === item.id ? 'selected' : ''} onClick={() => selectEvidence(item.id)}><span>{item.id}</span><strong>{item.title}</strong><small>{evidenceNotes[item.id] ?? t('trace.materials.delivery')}</small></button>)}<button aria-pressed={selected === 'security'} className={selected === 'security' ? 'selected' : ''} onClick={() => selectEvidence('security')}><span>{t('trace.materials.security')}</span><strong>{t('trace.materials.open')}</strong><small>{t('trace.materials.static')}</small></button></div></FrameworkCard><FrameworkCard title={evidence?.title ?? t('trace.pendingTitle')} action={<Origin kind={selected === 'security' ? 'static' : 'historical'} />}>{evidence ? <pre className="evidence-console">{evidence.body}</pre> : <div className="page-stack">{data.blueprint.gaps.slice(0, 2).map(gap => <div className="finding" key={gap.name}><Tag color="gold">{t('trace.pendingTag')}</Tag><h3>{gap.name}</h3><p>{gap.fact}</p><p className="muted">{gap.limit}</p></div>)}</div>}</FrameworkCard></div>
      </div> }] : []),
    ]} />
  </div>;
}
