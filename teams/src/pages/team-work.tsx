import { displayText, displayRequirementId } from '../display-text.js';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { TeamsPageIntro } from '../components/teams-reuse.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { presence, presenceLabel, teamUsage, type DemoMember, type Presence } from '../operations.js';
import { teamWorkIndex, type TeamWorkEntry } from '../project-overview.js';
import { RequirementDetail, requirementPhaseLabel } from '../components/requirement-detail.js';
import { TaskSessions } from '../components/task-sessions.js';
import { CollaborationProgress } from '../components/collaboration-progress.js';
import { TaskSessionActivity } from '../components/task-session-activity.js';
import { canLinkTaskSession, type CollectedSession, type TaskScope } from '../task-automation.js';
import '../operations.css';

const colors: Partial<Record<Presence, string>> = { '执行中': 'green', '等待人工处理': 'gold', '在线空闲': 'blue' };
// Status vocabularies are module-level, so getters keep `labels[key]`, Object.keys and Object.hasOwn
// working while every read still resolves against the ambient locale.
function labelGetters<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  return Object.defineProperties({} as Record<K, string>, Object.fromEntries(
    (Object.keys(keys) as K[]).map(key => [key, { get: () => currentT(keys[key]), enumerable: true }]),
  ));
}
const activityLabels = labelGetters({ started: 'tw.activity.started', progress: 'tw.activity.progress', blocked: 'tw.activity.blocked', result: 'tw.activity.result' } as const);
const knowledgeLabels = labelGetters({ 'waiting-upstream': 'tw.knowledge.waitingUpstream', queued: 'tw.knowledge.queued', running: 'tw.knowledge.running', ready: 'tw.knowledge.ready', waiting: 'tw.knowledge.waiting', failed: 'tw.knowledge.failed' } as const);
const collectionLabels = labelGetters({ queued: 'tw.collection.queued', running: 'tw.collection.running', collected: 'tw.collection.collected', empty: 'tw.collection.empty', failed: 'tw.collection.failed' } as const);
const conversationNodeLabels = labelGetters({ develop: 'tw.node.develop', verify: 'tw.node.verify' } as const);
/** Session node ids are plain strings; unknown ids keep the development label. */
const conversationNodeLabel = (node: string) => node === 'verify' ? conversationNodeLabels.verify : conversationNodeLabels.develop;
type ConversationNode = keyof typeof conversationNodeLabels;
type ConversationRow = CollectedSession & { id: string; entry: TeamWorkEntry };

export function MemberUsageTable() {
  const { state } = useDemo();
  const t = useT();
  return <Table<DemoMember> size="middle" rowKey="id" pagination={false} dataSource={teamUsage(state)} scroll={{ x: 720 }}
    expandable={{ rowExpandable: row => row.instances.length > 0, expandedRowRender: row => <div className="instance-list">{row.instances.map(instance => <Descriptions key={instance.id} size="small" column={2} items={[
      { key: 'id', label: t('tw.instanceLabel'), children: instance.id }, { key: 'state', label: t('tw.stateLabel'), children: <Tag color={colors[instance.state]}>{presenceLabel(instance.state)}</Tag> },
      { key: 'task', label: t('tw.taskLabel'), children: instance.task }, { key: 'project', label: t('common.project'), children: instance.project },
    ]} />)}</div> }}
    columns={[
      { title: t('tw.memberColumn'), dataIndex: 'name', width: 100 },
      { title: t('tw.runtimeColumn'), width: 140, render: (_, row) => <Tag color={colors[presence(row)]}>{presenceLabel(presence(row))}</Tag> },
      { title: t('tw.currentTaskColumn'), render: (_, row) => <div className="member-task"><strong>{row.instances[0]?.task ?? t('tw.notUsed')}</strong><small>{row.instances[0]?.project ?? '—'}</small></div> },
      { title: t('tw.lastActiveColumn'), dataIndex: 'lastActive', width: 130 },
    ]} />;
}

function SourceTags({ entry }: { entry: TeamWorkEntry }) {
  const t = useT();
  return <Space wrap><Tag color={entry.projectId === 'teams' ? 'blue' : 'purple'}>{entry.projectId === 'teams' ? t('tw.snapshotTag') : entry.item.source.origin === 'teams-task' ? t('tw.teamsTaskTag') : t('tw.currentFlowTag')}</Tag>{entry.item.activity && <Tag color="green">{t('tw.localReportTag')}</Tag>}{entry.item.source.requirement?.category === 'research' && <Tag>{t('tw.researchTag')}</Tag>}</Space>;
}
const ownerLabel = (entry: TeamWorkEntry) => entry.projectId === 'teams' ? currentT('tw.snapshotOwner', { name: entry.item.owner }) : entry.item.owner;

export function TeamWork() {
  const { navigate, state, data, role, update, busy } = useDemo();
  const t = useT();
  const [project, setProject] = useState('all'), [owner, setOwner] = useState('all'), [phase, setPhase] = useState('all');
  const [selected, setSelected] = useState<TeamWorkEntry | null>(null), [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [reportOpen, setReportOpen] = useState(false), [reportTaskId, setReportTaskId] = useState<string>();
  const [reportForm] = Form.useForm();
  const params = new URLSearchParams(location.hash.split('?')[1] ?? ''), requestedTab = params.get('tab');
  const activeTab = requestedTab === 'sessions' || (requestedTab === 'members' && role === 'owner') ? requestedTab : 'tasks';
  const changeRoute = (tab: string) => {
    const next = new URLSearchParams(params);
    if (tab === 'tasks') next.delete('tab'); else next.set('tab', tab);
    next.delete('view'); next.delete('traceProject'); next.delete('traceSession'); next.delete('trace');
    const query = next.toString(); navigate('team-work' + (query ? '?' + query : ''));
  };
  const entries = useMemo(() => teamWorkIndex(state, data, role).filter(entry => (includeSnapshots || entry.projectId !== 'teams') && (role === 'owner' || entry.item.assigneeId === role)), [state, data, role, includeSnapshots]);
  const projects = [...new Map(entries.map(entry => [entry.projectId, entry.projectName])).entries()];
  const owners = [...new Set(entries.map(entry => entry.item.owner))];
  const visible = entries.filter(entry => (project === 'all' || entry.projectId === project) && (owner === 'all' || entry.item.owner === owner) && (phase === 'all' || entry.item.phase === phase));
  const reportNodes = (entry: TeamWorkEntry) => (['develop', 'verify'] as const).filter(node => canLinkTaskSession(state, role, entry.scope, node));
  const reportable = visible.filter(entry => reportNodes(entry).length > 0), reportEntry = reportable.find(entry => entry.id === reportTaskId);
  const selectedEntry = selected ? entries.find(entry => entry.id === selected.id) ?? selected : null;
  const sessionRows: ConversationRow[] = visible.flatMap(entry => entry.sessions.map(session => ({ ...session, id: entry.id + ':' + session.tool + ':' + session.sessionId, entry })));
  const requestedSession = params.get('session'), requestedNode = params.get('node');
  const selectedSession = (requestedSession ? sessionRows.find(row => row.sessionId === requestedSession && row.entry.scope.projectId === params.get('project') && row.entry.scope.taskId === params.get('task')) : sessionRows[0]) ?? null;
  const selectedNode: ConversationNode = requestedNode === 'verify' && selectedSession?.nodeIds.includes('verify') ? 'verify' : selectedSession && !selectedSession.nodeIds.includes('develop') ? 'verify' : 'develop';
  const openConversation = (scope: TaskScope, node: ConversationNode, sessionId: string) => {
    const next = new URLSearchParams(params); next.set('tab', 'sessions'); next.set('view', 'conversations'); next.set('project', scope.projectId); next.set('task', scope.taskId); next.set('node', node); next.set('session', sessionId);
    next.delete('traceProject'); next.delete('traceSession'); next.delete('trace'); navigate('team-work?' + next.toString());
  };
  const selectConversation = (row: ConversationRow, node?: ConversationNode) => {
    const nextNode = node ?? (row.nodeIds.includes(selectedNode) ? selectedNode : row.nodeIds[0] === 'verify' ? 'verify' : 'develop');
    openConversation(row.entry.scope, nextNode, row.sessionId);
  };
  const openReport = () => {
    const first = reportable[0]; if (!first) return;
    setReportTaskId(first.id); reportForm.resetFields(); reportForm.setFieldsValue({ task: first.id, nodeId: reportNodes(first)[0], tool: 'icode', sessionId: '' }); setReportOpen(true);
  };
  const filters = <div className="team-work-filters"><Space wrap><Select aria-label={t('tw.filterProject')} value={project} onChange={setProject} options={[{ value: 'all', label: t('tw.allProjects') }, ...projects.map(([value, label]) => ({ value, label }))]} /><Select aria-label={t('tw.filterOwner')} value={owner} onChange={setOwner} options={[{ value: 'all', label: t('tw.allOwners') }, ...owners.map(value => ({ value, label: entries.find(entry => entry.item.owner === value)?.projectId === 'teams' ? t('tw.snapshotOwner', { name: value }) : value }))]} /><Select aria-label={t('tw.filterPhase')} value={phase} onChange={setPhase} options={[{ value: 'all', label: t('tw.allPhases') }, ...(['待开展', '准备', '开发', '验证', '待验收', '已交付'] as const).map(value => ({ value, label: requirementPhaseLabel(value) }))]} />{role === 'owner' && <Checkbox checked={includeSnapshots} onChange={event => { setIncludeSnapshots(event.target.checked); if (!event.target.checked) { setProject('all'); setOwner('all'); } }}>{t('tw.showSnapshots')}</Checkbox>}</Space><span>{t('tw.taskRatio', { visible: visible.length, total: entries.length })}</span></div>;
  return <div className="page-stack team-work-page"><TeamsPageIntro actions={<Tag>{t('tw.taskCount', { count: entries.length })}</Tag>}>{t('tw.intro')}</TeamsPageIntro>
    <Tabs activeKey={activeTab} onChange={value => changeRoute(value)} items={[
      { key: 'tasks', label: t('tw.tabTasks'), children: <>{filters}<FrameworkCard title={t('tw.indexTitle')}><Table<TeamWorkEntry> rowKey="id" size="middle" pagination={false} scroll={{ x: 1120 }} dataSource={visible} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tw.emptyTasks')} /> }} columns={[
        { title: t('tw.colProject'), width: 270, render: (_, entry) => <div className="team-work-cell"><strong>{entry.projectName}</strong><span>{displayText(entry.item.source.title)}</span><small>{displayRequirementId(entry.scope.taskId)}</small></div> },
        { title: includeSnapshots ? t('tw.colOwnerSource') : t('tw.colOwner'), width: includeSnapshots ? 180 : 105, render: (_, entry) => ownerLabel(entry) },
        { title: t('tw.colPhase'), width: 115, render: (_, entry) => <Tag color={entry.item.phase === '已交付' ? 'green' : entry.item.phase === '待验收' ? 'gold' : undefined}>{requirementPhaseLabel(entry.item.phase)}</Tag> },
        { title: t('tw.colLastReport'), render: (_, entry) => <div className="team-work-cell"><span>{entry.item.activity ? activityLabels[entry.item.activity.phase] : t('tw.noReport')}</span><small>{entry.item.activity ? displayText(entry.item.activity.summary) : t('tw.noReportHint')}</small></div> },
        { title: t('tw.colSessions'), width: 175, render: (_, entry) => <div className="team-work-cell"><span>{t('tw.sessionCount', { count: entry.sessions.length })}</span><small>{entry.automation?.collection ? collectionLabels[entry.automation.collection.status] : entry.automation?.knowledge ? t('tw.knowledgeStatus', { status: knowledgeLabels[entry.automation.knowledge.status] }) : t('tw.noAutomation')}</small></div> },
        { title: t('tw.colSource'), width: 155, render: (_, entry) => <SourceTags entry={entry} /> },
        { title: t('tw.colActions'), width: 95, render: (_, entry) => <Button type="link" size="small" onClick={() => setSelected(entry)}>{t('tw.viewDetails')}</Button> },
      ]} /></FrameworkCard></> },
      { key: 'sessions', label: t('tw.sessionsTitle'), children: <div className="team-work-session-view">
        <div className="team-work-session-toolbar"><Space wrap><Button aria-label={t('tw.reportSessionAria')} onClick={openReport} disabled={!reportable.length} title={reportable.length ? t('tw.reportHint') : t('tw.reportDisabled')}>{t('tw.reportSession')}</Button></Space><span>{t('tw.sessionPickHint')}</span></div>
        <div className="team-work-conversation-view">{filters}<div className="team-work-conversation-layout">
          <FrameworkCard title={t('tw.sessionsTitle')} action={<Tag>{t('tw.sessionRowCount', { count: sessionRows.length })}</Tag>}><div className="team-work-session-list">{sessionRows.length ? sessionRows.map(row => <button type="button" key={row.id} data-conversation-session={row.sessionId} aria-pressed={selectedSession?.id === row.id} className={'team-work-session-item' + (selectedSession?.id === row.id ? ' selected' : '')} onClick={() => selectConversation(row)}>
            <span className="team-work-session-item-heading"><Tag>{row.tool}</Tag><strong>{displayText(row.entry.item.source.title)}</strong></span>
            <small>{row.entry.projectName} · {displayRequirementId(row.entry.scope.taskId)}</small><code title={row.sessionId}>{row.sessionId}</code>
            <span className="team-work-session-item-meta"><span>{row.nodeIds.map(node => conversationNodeLabel(node)).join(' / ')}</span><time dateTime={row.lastAt}>{new Date(row.lastAt).toLocaleString('zh-CN', { hour12: false })}</time></span>
          </button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tw.emptySessions')} />}</div></FrameworkCard>
          <FrameworkCard title={t('tw.conversationTitle')} action={selectedSession ? <Tag>{conversationNodeLabels[selectedNode]}</Tag> : undefined}>{selectedSession ? <>
            <div className="team-work-conversation-context"><div><strong>{displayText(selectedSession.entry.item.source.title)}</strong><span>{selectedSession.entry.projectName} · {displayRequirementId(selectedSession.entry.scope.taskId)}</span><code title={selectedSession.sessionId}>{selectedSession.tool} · {selectedSession.sessionId}</code></div><Select aria-label={t('tw.pickNode')} value={selectedNode} onChange={node => selectConversation(selectedSession, node)} options={selectedSession.nodeIds.map(node => ({ value: node, label: conversationNodeLabel(node) }))} /></div>
            {activeTab === 'sessions' && <TaskSessionActivity key={selectedSession.id + ':' + selectedNode} projectId={selectedSession.entry.scope.projectId} taskId={selectedSession.entry.scope.taskId} nodeId={selectedNode} sessionId={selectedSession.sessionId} showSessionSelector={false} readonlySource={selectedSession.entry.projectId === 'teams'} />}
          </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={requestedSession ? t('tw.sessionUnavailable') : sessionRows.length ? t('tw.sessionPick') : t('tw.noNativeSession')} />}</FrameworkCard>
        </div></div>
      </div> },
      ...(role === 'owner' ? [{ key: 'members', label: t('tw.tabMembers'), children: <FrameworkCard title={t('tw.membersTitle')} action={<Tag>{t('tw.sampleTag')}</Tag>}><MemberUsageTable /><p className="muted">{t('tw.membersNote')}</p></FrameworkCard> }] : []),
    ]} />
    <Drawer title={selectedEntry?.item.source.title ?? t('tw.taskDetail')} width={820} open={!!selectedEntry} onClose={() => setSelected(null)} destroyOnHidden>{selectedEntry && <div className="page-stack"><SourceTags entry={selectedEntry} /><RequirementDetail projectId={selectedEntry.projectId} item={selectedEntry.item} />{selectedEntry.projectId !== 'teams' && <>
      {selectedEntry.automation && <FrameworkCard title={t('tw.automationTitle')}><Descriptions column={1} size="small" items={[{ key: 'knowledge', label: t('tw.knowledgeLabel'), children: selectedEntry.automation.knowledge ? knowledgeLabels[selectedEntry.automation.knowledge.status] : t('tw.notTriggered') }, { key: 'collection', label: t('tw.collectionLabel'), children: selectedEntry.automation.collection ? collectionLabels[selectedEntry.automation.collection.status] : t('tw.notTriggered') }, { key: 'reporting', label: t('tw.talentsShare'), children: selectedEntry.automation.collection?.reporting?.status === 'reported' ? t('tw.shared', { id: selectedEntry.automation.collection.reporting.receipt?.id ?? '' }) : selectedEntry.automation.collection?.reporting?.reason ?? t('tw.notShared') }]} /></FrameworkCard>}
      <TaskSessions readonly scope={selectedEntry.scope} /><CollaborationProgress projectId={selectedEntry.scope.projectId} taskId={selectedEntry.scope.taskId} />
    </>}{selectedEntry.scope.projectId === 'carddemo' && selectedEntry.scope.taskId === 'DEMO-MKT-001' && <Button onClick={() => navigate('trace')}>{t('tw.openMainRecord')}</Button>}</div>}</Drawer>
    <Modal title={t('tw.reportTitle')} open={reportOpen && reportable.length > 0} onCancel={() => setReportOpen(false)} okText={t('tw.reportOk')} cancelText={t('common.cancel')} confirmLoading={busy} okButtonProps={{ 'aria-label': t('tw.reportConfirmAria'), disabled: busy }} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} onOk={() => reportForm.submit()}>
      <Form form={reportForm} layout="vertical" disabled={busy} onFinish={async values => { const entry = reportable.find(item => item.id === values.task); if (!entry) return; const result = await update('session.link', { ...entry.scope, nodeId: values.nodeId, tool: values.tool, sessionId: values.sessionId }); if (result) { setReportOpen(false); openConversation(entry.scope, values.nodeId, values.sessionId.trim()); } }}>
        <Form.Item name="task" label={t('tw.taskLabel')} rules={[{ required: true, message: t('tw.chooseTask') }]}><Select aria-label={t('tw.reportTaskAria')} value={reportTaskId} onChange={value => { setReportTaskId(value); const entry = reportable.find(item => item.id === value); if (entry) reportForm.setFieldValue('nodeId', reportNodes(entry)[0]); }} options={reportable.map(entry => ({ value: entry.id, label: entry.projectName + ' · ' + displayText(entry.item.source.title) + ' · ' + ownerLabel(entry) }))} /></Form.Item>
        <Form.Item name="nodeId" label={t('tw.fieldNode')} rules={[{ required: true, message: t('tw.chooseNode') }]}><Select aria-label={t('tw.reportNodeAria')} options={(reportEntry ? reportNodes(reportEntry) : []).map(node => ({ value: node, label: conversationNodeLabels[node] }))} /></Form.Item>
        <Form.Item name="tool" label={t('tw.fieldTool')} rules={[{ required: true, message: t('tw.chooseTool') }]}><Select aria-label={t('tw.reportToolAria')} options={[{ value: 'icode', label: 'iCode' }, { value: 'opencode', label: 'OpenCode' }]} /></Form.Item>
        <Form.Item name="sessionId" label={t('tw.fieldSessionId')} rules={[{ required: true, whitespace: true, message: t('tw.enterSessionId') }]}><Input aria-label={t('tw.reportSessionIdAria')} maxLength={200} placeholder={t('tw.sessionIdPlaceholder')} /></Form.Item>
      </Form>
      <p className="muted">{t('tw.reportNote')}</p>
    </Modal>
  </div>;
}
