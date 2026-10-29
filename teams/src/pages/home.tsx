import { currentActorId, taskExecutableBy } from '../task-visibility.js';
import { preferredDeliveryTask, projectDeliveryTasks, type ProjectDeliveryTask } from '../project-delivery-tasks.js';
import { deliveryRequirement, requirementNode, verificationChecks } from '../delivery-requirements.js';
import { taskAssigneeName } from '../task-assignment.js';
import { displayText } from '../display-text.js';
import { useEffect, useMemo, useState } from 'react';
import { Button, Descriptions, Drawer, Empty, Select, Space, Steps, Table, Tabs, Tag } from 'antd';
import { ArrowRightOutlined, ApartmentOutlined, FolderOpenOutlined, RobotOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { Heading, MiniStat, Origin, talentLink } from '../components/common.js';
import { presence, presenceLabel, teamUsage, type Presence } from '../operations.js';
import '../operations.css';
import '../project-overview.css';
import { ProjectKnowledge } from '../components/project-knowledge.js';
import { teamWorkIndex } from '../project-overview.js';
import { mainTask, taskAutomation } from '../task-automation.js';
import { getTools, type NativeStatus } from '../api.js';
import { TeamsPageIntro } from '../components/teams-reuse.js';

export function nextStep(state: ReturnType<typeof useDemo>['state'], role: 'owner' | 'member' = 'owner') {
  const tasks = projectDeliveryTasks(state, 'carddemo', role);
  const actionable = role === 'owner' ? tasks.find(task => task.pendingAssignment || task.phase === '待验收') : undefined;
  const selected = actionable ?? preferredDeliveryTask(tasks.filter(task => taskExecutableBy(role, task.assigneeId) && !task.accepted), role) ?? preferredDeliveryTask(tasks, role);
  const responsible: 'owner' | 'member' = selected?.pendingAssignment || selected?.phase === '待验收' || selected?.accepted ? 'owner' : selected?.assigneeId === 'owner' ? 'owner' : 'member';
  return { title: !selected ? currentT('home.next.viewTasks') : selected.pendingAssignment ? currentT('home.next.assign') : selected.phase === '待验收' ? currentT('home.next.accept') : selected.accepted ? currentT('home.next.viewAcceptShare') : currentT('home.next.continue', { status: selected.status }),
    note: selected ? currentT('home.next.note', { title: selected.title }) : currentT('home.next.noTask'),
    href: '#/' + (selected && !selected.pendingAssignment ? selected.route : 'projects?project=carddemo&tab=management'), responsible };
}

type Tool = 'iCode' | 'OpenCode';
interface UsageRow { id: string; memberId: string; name: string; tool: Tool; model: string; tokens: number; input: number; output: number; status: Presence; project: string; task: string; lastActive: string; days: number; used: boolean }
interface MemberAgentRow { id: string; memberId: string; name: string; tool: Tool; project: string; task: string; sessionId: string; nodes: string; sources: string; lastActive: string }
const statusColor: Record<Presence, string | undefined> = { '未使用': undefined, '离线': undefined, '在线空闲': 'blue', '执行中': 'green', '等待人工处理': 'gold' };
// Status vocabularies are module-level, so getters keep `labels[key]`, Object.keys and Object.hasOwn
// working while every read still resolves against the ambient locale.
function labelGetters<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  return Object.defineProperties({} as Record<K, string>, Object.fromEntries(
    (Object.keys(keys) as K[]).map(key => [key, { get: () => currentT(keys[key]), enumerable: true }]),
  ));
}
const knowledgeStatusLabels = labelGetters({ 'waiting-upstream': 'home.knowledge.waitingUpstream', queued: 'home.knowledge.queued', running: 'home.knowledge.running', ready: 'home.knowledge.ready', waiting: 'home.knowledge.waiting', failed: 'home.knowledge.failed' } as const);
const collectionStatusLabels = labelGetters({ queued: 'home.collection.queued', running: 'home.collection.running', collected: 'home.collection.collected', empty: 'home.collection.empty', failed: 'home.collection.failed' } as const);
const evolutionStatusLabels = labelGetters({ none: 'home.evolution.none', candidate: 'home.evolution.candidate', evaluated: 'home.evolution.evaluated', published: 'home.evolution.published', adopted: 'home.evolution.adopted' } as const);
const formatTokens = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : String(n);
function useUsageRows(days: number) {
  const { state } = useDemo();
  const t = useT();
  return useMemo(() => {
    const samples = teamUsage(state);
    return state.workspace.team.members.filter(m => m.status === 'active').flatMap(member => {
      const sample = samples.find(s => s.name === member.name), used = sample?.used ?? false;
      const today = sample?.tokens ?? 0, total = days === 1 ? today : today * 4 + (used ? 48000 : 0);
      const status = sample ? presence(sample) : '未使用';
      const task = sample?.instances[0]?.task ?? t('home.noExecutionRecord');
      const project = ['owner', 'member'].includes(member.id) ? state.workspace.project.name : sample?.instances[0]?.project ?? t('home.notAssigned');
      const make = (tool: Tool, tokens: number, current: Presence): UsageRow => ({ id: `${member.id}-${tool}`, memberId: member.id, name: member.name, tool, model: tool === 'iCode' ? t('home.model.defaultA') : t('home.model.defaultB'), tokens, input: Math.round(tokens * .74), output: tokens - Math.round(tokens * .74), status: current, project, task: tool === 'OpenCode' ? '接口用例补充' : task, lastActive: sample?.lastActive ?? t('home.noRecord'), days, used });
      return member.name === '苏晴' ? [make('iCode', Math.round(total * .7), status), make('OpenCode', total - Math.round(total * .7), '在线空闲')] : [make('iCode', total, status)];
    });
  }, [state, days, t]);
}

export function Home() {
  const { state, data, role, navigate } = useDemo(), owner = role === 'owner';
  const t = useT();
  const [member, setMember] = useState('all'), [tool, setTool] = useState('all'), [period, setPeriod] = useState('today'), [selected, setSelected] = useState<UsageRow | null>(null);
  const [nativeTools, setNativeTools] = useState<NativeStatus>(), [nativeToolsError, setNativeToolsError] = useState('');
  useEffect(() => {
    let live = true;
    getTools().then(result => { if (live) setNativeTools(result); }).catch(error => { if (live) setNativeToolsError((error as Error).message); });
    return () => { live = false; };
  }, []);
  const rows = useUsageRows(period === 'today' ? 1 : 7);
  const filtered = rows.filter(row => (owner ? member === 'all' || row.memberId === member : row.memberId === 'member') && (tool === 'all' || row.tool === tool));
  const memberAgentRows = useMemo(() => teamWorkIndex(state, data, role).flatMap(entry => entry.sessions.map(session => ({
    id: `${entry.id}:${session.tool}:${session.sessionId}`,
    memberId: entry.item.assigneeId ?? '',
    name: entry.item.owner,
    tool: session.tool === 'icode' ? 'iCode' as const : 'OpenCode' as const,
    project: entry.projectName,
    task: entry.item.source.title,
    sessionId: session.sessionId,
    nodes: session.nodeIds.join(' / '),
    sources: session.sources.join(t('common.listSeparator')),
    lastActive: session.lastAt,
  }))), [state, data, role, t]);
  const agentFiltered = memberAgentRows.filter(row => (owner ? member === 'all' || row.memberId === member : row.memberId === 'member') && (tool === 'all' || row.tool === tool));
  const people = [...new Set(filtered.map(row => row.memberId))];
  const tokenPeople = people.filter(id => filtered.some(row => row.memberId === id && row.tokens > 0)), zeroTokenPeople = people.length - tokenPeople.length;
  const countPeople = (predicate: (row: UsageRow) => boolean) => new Set(filtered.filter(predicate).map(row => row.memberId)).size;
  const used = countPeople(row => row.used), active = countPeople(row => row.tokens > 0), online = countPeople(row => ['在线空闲', '执行中', '等待人工处理'].includes(row.status)), running = countPeople(row => row.status === '执行中');
  const tokens = filtered.reduce((sum, row) => sum + row.tokens, 0), input = filtered.reduce((sum, row) => sum + row.input, 0);
  const requested = new URLSearchParams(location.hash.split('?')[1]).get('tab') ?? 'overview';
  const tabs = owner ? [{ key: 'overview', label: t('home.tab.overview') }, { key: 'projects', label: t('home.tab.projects') }, { key: 'tools', label: t('home.tab.tools') }, { key: 'tokens', label: t('home.tab.tokens') }] : [{ key: 'overview', label: t('home.tab.myTasks') }, { key: 'jobs', label: t('home.tab.jobs') }, { key: 'tokens', label: t('home.tab.myTokens') }];
  const tab = tabs.some(item => item.key === requested) ? requested : 'overview';
  const tasks = projectDeliveryTasks(state, 'carddemo', role), ownTasks = tasks.filter(task => taskExecutableBy(role, task.assigneeId));
  const focus = preferredDeliveryTask(tasks, role), record = focus?.record;
  const hasAssigned = !!focus?.assigneeId, hasContext = !!record?.preparedAt;
  const checks = record ? verificationChecks(record) : [];
  const checkState = checks.some(check => check.status === 'failed') ? 'failed' : checks.length ? 'passed' : 'none';
  const deliveryStage = record?.stage === 'accepted' ? 'accepted' : record?.stage === 'awaiting-acceptance' ? 'submitted' : record?.stage === 'returned' ? 'returned' : record?.stage === 'verifying' ? checkState === 'failed' ? 'failed' : 'fixed' : record?.stage === 'developing' ? 'developing' : hasAssigned ? 'assigned' : 'draft';
  const ownerName = state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '', memberName = state.workspace.team.members.find(item => item.id === 'member')?.name ?? '';
  const next = nextStep(state, role), mine = next.responsible === (owner ? 'owner' : 'member');
  const taskEvents = (state.workspace.collaboration?.events ?? []).filter(item => item.projectId === 'carddemo' && item.taskId === focus?.id);
  const timeline = taskEvents.map(item => ({ id: item.id, text: item.summary, at: item.at }));
  const returnReason = record?.stage === 'returned' ? record.nodes.accept.summary : '';
  const mainAutomation = focus ? taskAutomation(state, { projectId: 'carddemo', taskId: focus.id }) : undefined;
  const activity = taskEvents.map(item => ({ id: item.id, text: item.summary, at: item.at, source: 'Teams CLI · ' + item.nodeId, actorId: item.role, actor: item.role === 'owner' ? ownerName : memberName })).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const hasActivity = activity.length > 0 || deliveryStage === 'returned';
  const personalActivity = activity.filter(item => item.actorId === currentActorId(role)), hasPersonalActivity = personalActivity.length > 0 || deliveryStage === 'returned';
  const showAutomation = !!mainAutomation || deliveryStage === 'accepted';
  const stats = <div className="metrics-row ops-metrics" data-testid="team-usage-metrics"><MiniStat label={t('home.stats.used')} value={`${used} / ${people.length}`} note={t('home.stats.usedNote')} /><MiniStat label={period === 'today' ? t('home.stats.todayUsers') : t('home.stats.weekUsers')} value={active} note={t('home.stats.activeNote')} /><MiniStat label={t('home.stats.online')} value={online} note={t('home.stats.onlineNote')} /><MiniStat label={t('home.stats.running')} value={running} note={t('home.stats.runningNote')} /></div>;
  const filters = <div className="ops-filters"><Space wrap>{owner && <Select aria-label={t('home.filter.memberAria')} value={member} onChange={setMember} options={[{ value: 'all', label: t('home.filter.allMembers') }, ...state.workspace.team.members.filter(m => m.status === 'active').map(m => ({ value: m.id, label: m.name }))]} />}<Select aria-label={t('home.filter.toolAria')} value={tool} onChange={setTool} options={[{ value: 'all', label: t('home.filter.allTools') }, { value: 'iCode', label: 'iCode' }, { value: 'OpenCode', label: 'OpenCode' }]} /><Select aria-label={t('home.filter.periodAria')} value={period} onChange={setPeriod} options={[{ value: 'today', label: t('home.filter.periodToday') }, { value: 'week', label: t('home.filter.periodWeek') }]} /></Space><Origin kind="simulated" /></div>;
  const usageTable = <Table<UsageRow> rowKey="id" size="middle" pagination={false} scroll={{ x: 680 }} dataSource={filtered} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.table.noUsage')} /> }} columns={[
    { title: t('home.table.memberTool'), key: 'member', width: 140, render: (_, row) => <div className="ops-table-person"><strong>{row.name}</strong><small>{row.tool}</small></div> },
    { title: t('home.table.status'), key: 'status', width: 125, render: (_, row) => <Tag color={statusColor[row.status]}>{presenceLabel(row.status)}</Tag> },
    { title: t('home.table.taskProject'), key: 'task', render: (_, row) => <div className="ops-table-person"><strong>{displayText(row.task)}</strong><small>{row.project}</small></div> },
    { title: 'Token', key: 'tokens', width: 90, render: (_, row) => formatTokens(row.tokens) },
    { title: t('home.table.action'), key: 'open', width: 80, render: (_, row) => <Button type="link" size="small" onClick={() => setSelected(row)}>{t('home.table.detail')}</Button> },
  ]} />;
  const memberAgentTable = <Table<MemberAgentRow> rowKey="id" size="middle" pagination={false} scroll={{ x: 900 }} dataSource={agentFiltered} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.table.noAgentSessions')} /> }} columns={[
    { title: t('home.table.member'), dataIndex: 'name', width: 100 }, { title: 'Agent', dataIndex: 'tool', width: 110 },
    { title: t('home.table.linkedTaskProject'), key: 'task', render: (_, row) => <div className="ops-table-person"><strong>{displayText(row.task)}</strong><small>{row.project}</small></div> },
    { title: t('home.table.sessionNode'), key: 'session', width: 230, render: (_, row) => <div className="ops-table-person"><strong>{row.sessionId}</strong><small>{row.nodes}</small></div> },
    { title: t('home.table.source'), dataIndex: 'sources', width: 150 },
    { title: t('home.table.lastLinked'), key: 'lastActive', width: 170, render: (_, row) => new Date(row.lastActive).toLocaleString('zh-CN', { hour12: false }) },
  ]} />;
  const localAgents = [
    { name: 'iCode', installed: nativeTools?.icode.installed, version: nativeTools?.icode.version },
    { name: 'OpenCode', installed: nativeTools?.opencode.installed, version: nativeTools?.opencode.version },
  ];
  return <div className="page-stack ops-page"><TeamsPageIntro actions={<Tag color="purple">{owner ? ownerName + ' · ' + t('home.responsible.owner') : memberName + ' · ' + t('home.responsible.member')}</Tag>}>{state.workspace.team.name} · {owner ? t('home.intro.owner') : t('home.intro.member')}</TeamsPageIntro>
    <Tabs activeKey={tab} onChange={value => navigate('home?tab=' + value)} items={tabs} />
    {(owner && !['overview', 'projects'].includes(tab) || !owner && ['tokens', 'jobs'].includes(tab)) && filters}
    {owner && tab === 'tools' && stats}
    {tab === 'overview' && <div className="ops-owner-overview">
      <div className="ops-overview-hero">
        <FrameworkCard title={t('home.hero.title')} action={<Button type="link" onClick={() => navigate(focus?.route ?? 'projects?project=carddemo&tab=management')}>{t('home.hero.openFlow')}</Button>}><div className="ops-current-requirement"><div className="ops-requirement-meta"><span>{state.workspace.project.name} · {focus?.id.replace(/^DEMO-/, '') ?? '—'}</span><Tag color={(focus?.status ?? t('home.hero.noStatus')).includes('待') ? 'gold' : 'purple'}>{focus?.status ?? t('home.hero.noStatus')}</Tag></div><h3>{focus?.title ?? t('home.hero.noTask')}</h3><p>{record?.description ?? t('home.hero.emptyDesc')}</p><div className="ops-next-action"><div><span>{mine ? t('home.hero.mine') : t('home.hero.waiting', { role: t(owner ? 'home.responsible.owner' : 'home.responsible.member') })}</span><strong>{next.title}</strong><p>{next.note}</p></div><Button type={mine ? 'primary' : 'default'} href={mine ? next.href : '#/projects?tab=delivery'}>{mine ? t('home.hero.go') : t('home.hero.viewCollab')}</Button></div><DeliverySteps task={focus} /></div></FrameworkCard>
        {owner ? <FrameworkCard title={t('home.ready.title')} action={<Tag color={hasContext ? 'green' : undefined}>{hasContext ? t('home.ready.ready') : t('home.ready.preparing')}</Tag>}><div className="ops-readiness-list"><div className="ops-readiness-row"><span>{t('home.ready.assets')}</span><strong>{t('home.ready.assetsCount', { count: state.workspace.project.assets.length })}</strong></div><div className="ops-readiness-knowledge"><ProjectKnowledge projectId="carddemo" compact /></div><div className="ops-readiness-row"><span>{t('home.ready.assignment')}</span><Tag color={hasAssigned ? 'green' : 'gold'}>{hasAssigned ? focus?.owner ?? t('home.ready.assignedFallback') : t('home.ready.toConfirm')}</Tag></div><div className="ops-readiness-row ops-readiness-stack"><span>{t('home.ready.capability')}</span><strong>{t('home.ready.skillAgent', { skills: state.workspace.selectedSkills.length, agent: state.adoptedAgent })}</strong><small>{hasContext ? t('home.ready.frozen') : t('home.ready.notFrozenNote')}</small></div><div className="ops-readiness-row"><span>{t('home.ready.context')}</span><Tag color={hasContext ? 'green' : undefined}>{hasContext ? t('home.ready.contextFrozen') : t('home.ready.contextUnfrozen')}</Tag></div></div></FrameworkCard> : <FrameworkCard title={t('home.mine.title')}><div className="ops-readiness-list"><div className="ops-readiness-row"><span>{t('home.mine.assignedToMe')}</span><strong>{ownTasks.length}</strong></div><div className="ops-readiness-row"><span>{t('home.mine.stage')}</span><Tag color={(focus?.status ?? t('home.hero.noStatus')).includes('待') ? 'gold' : 'purple'}>{focus?.status ?? t('home.hero.noStatus')}</Tag></div><div className="ops-readiness-row"><span>{t('home.mine.checks')}</span><strong>{checkState === 'failed' ? t('home.mine.toFix') : checkState === 'passed' ? t('home.mine.retestPassed') : t('home.mine.toRun')}</strong></div><div className="ops-readiness-row"><span>{t('home.mine.synced')}</span><strong>{t('home.mine.count', { count: timeline.length })}</strong></div></div></FrameworkCard>}
      </div>
      {owner ? (hasActivity || showAutomation) && <div className={hasActivity && showAutomation ? 'ops-overview-secondary' : 'ops-overview-secondary single'}>
        {hasActivity && <FrameworkCard title={t('home.activity.title')} action={<Button type="link" onClick={() => navigate('trace?project=carddemo&task=' + encodeURIComponent(focus?.id ?? 'DEMO-MKT-001'))}>{t('home.activity.viewRecords')}</Button>}>{deliveryStage === 'returned' && <div className="ops-feedback"><strong>{t('home.activity.returned')}</strong><p>{returnReason}</p></div>}{activity.length ? <div className="ops-feed">{activity.map(item => <div key={item.id}><span className="activity-dot" /><div><strong>{displayText(item.text)}</strong><small>{item.source} · {item.actor} · {new Date(item.at).toLocaleString('zh-CN')}</small></div></div>)}</div> : <p className="muted">{t('home.activity.empty')}</p>}</FrameworkCard>}
        {showAutomation && <FrameworkCard title={t('home.automation.title')} action={<Tag>{t('home.automation.tag')}</Tag>}><div className="ops-readiness-list"><div className="ops-readiness-row"><span>{t('home.automation.knowledge')}</span><strong>{mainAutomation?.knowledge ? knowledgeStatusLabels[mainAutomation.knowledge.status] : t('home.automation.notTriggered')}</strong></div><div className="ops-readiness-row"><span>{t('home.automation.collection')}</span><strong>{mainAutomation?.collection ? collectionStatusLabels[mainAutomation.collection.status] : deliveryStage === 'accepted' ? t('home.automation.toCollect') : t('home.automation.toAccept')}</strong></div><div className="ops-readiness-row ops-readiness-stack"><span>{t('home.automation.sharing')}</span><strong>{mainAutomation?.collection?.reporting?.status === 'reported' ? t('home.automation.shared') : mainAutomation?.collection?.reporting?.status === 'failed' ? t('home.automation.shareFailed') : mainAutomation?.collection?.reporting?.status === 'uploading' ? t('home.automation.sharingNow') : t('home.automation.notShared')}</strong><small>{mainAutomation?.collection?.reporting?.reason ?? t('home.automation.shareNote')}</small></div><div className="ops-readiness-row ops-readiness-stack"><span>{t('home.automation.evolution')}</span><strong>{evolutionStatusLabels[state.evolution]}</strong><small>{t('home.automation.currentCapability', { skill: state.adoptedSkill, agent: state.adoptedAgent })}</small></div></div></FrameworkCard>}
      </div> : hasPersonalActivity && <div className="ops-overview-secondary single"><FrameworkCard title={t('home.mineActivity.title')} action={<Button type="link" onClick={() => navigate('trace?project=carddemo&task=' + encodeURIComponent(focus?.id ?? 'DEMO-MKT-001'))}>{t('home.activity.viewRecords')}</Button>}>{deliveryStage === 'returned' && <div className="ops-feedback"><strong>{t('home.activity.returned')}</strong><p>{returnReason}</p></div>}{personalActivity.length ? <div className="ops-feed">{personalActivity.map(item => <div key={item.id}><span className="activity-dot" /><div><strong>{displayText(item.text)}</strong><small>{item.source} · {item.actor} · {new Date(item.at).toLocaleString('zh-CN')}</small></div></div>)}</div> : <p className="muted">{t('home.mineActivity.empty')}</p>}<Space wrap><Button onClick={() => navigate('projects?tab=delivery&node=develop')}>{t('home.mineActivity.viewDev')}</Button><Button onClick={() => navigate('trace?project=carddemo&task=' + encodeURIComponent(focus?.id ?? 'DEMO-MKT-001'))}>{t('home.activity.viewRecords')}</Button></Space></FrameworkCard></div>}
      {owner ? <div className="ops-usage-card"><FrameworkCard title={t('home.usage.team')} action={<Button type="link" onClick={() => navigate('home?tab=tokens')}>{t('home.usage.analysis')} <ArrowRightOutlined /></Button>}>{filters}<div className="ops-usage-content">{stats}<div className="ops-usage-token"><span>{t('home.usage.scope', { period: period === 'today' ? t('home.period.today') : t('home.period.week') })}</span><strong>{formatTokens(tokens)}</strong><small>Token</small></div></div></FrameworkCard></div> : <div className="ops-usage-card"><FrameworkCard title={t('home.usage.mine')} action={<Button type="link" onClick={() => navigate('home?tab=tokens')}>{t('home.usage.analysis')} <ArrowRightOutlined /></Button>}><div className="ops-usage-token ops-usage-token-compact"><span>{t('home.usage.mineScope', { period: period === 'today' ? t('home.period.today') : t('home.period.week') })}</span><strong>{formatTokens(tokens)}</strong></div></FrameworkCard></div>}
      <nav className="ops-overview-links" aria-label={t('home.links.aria')}><strong>{t('home.links.title')}</strong><div><a href="#/agent">{t('home.links.agents')}</a><a href="#/projects?tab=content">{t('home.links.projects')}</a><a href="#/resources">{t('home.links.resources')}</a>{owner && <a href={talentLink('knowledge')}>{t('home.links.talents')}</a>}</div></nav>
    </div>}
    {tab === 'projects' && <><div className="metrics-row ops-metrics"><MiniStat label={t('home.projects.current')} value={1} note={state.workspace.project.name} /><MiniStat label={t('home.projects.assigned')} value={tasks.filter(task => !task.pendingAssignment).length} note={t('home.projects.assignedNote')} /><MiniStat label={t('home.projects.acceptance')} value={tasks.filter(task => task.phase === '待验收').length} note={t('home.projects.acceptanceNote')} /><MiniStat label={t('home.projects.done')} value={tasks.filter(task => task.accepted).length} note={t('home.projects.doneNote')} /></div><FrameworkCard title={state.workspace.project.name} action={<Button type="primary" onClick={() => navigate(focus?.route ?? 'projects?project=carddemo&tab=management')}>{t('home.projects.enter')}</Button>}><div className="ops-project-progress"><DeliverySteps task={focus} /><div className="ops-stage-summary"><span><strong>{t('home.projects.owner')}</strong> {focus?.owner ?? t('home.toAssign')}</span><span><strong>{t('home.projects.status')}</strong> {focus?.status ?? t('home.hero.noStatus')}</span><span><strong>{t('home.projects.latest')}</strong> {timeline.at(-1)?.text ?? t('home.projects.waitingProgress')}</span></div></div>{deliveryStage === 'returned' && <p className="ops-feedback">{t('home.projects.pendingReturn', { reason: returnReason })}</p>}</FrameworkCard><FrameworkCard title={t('home.projects.activity')} action={<Tag>{t('home.projects.toolRecords', { count: filtered.length })}</Tag>}><div className="ops-card-filters">{filters}</div>{usageTable}</FrameworkCard></>}
    {['tools', 'jobs'].includes(tab) && <>{!owner && stats}<div className="ops-two ops-tools-summary"><FrameworkCard title={t('home.tools.distribution')}>{(['iCode', 'OpenCode'] as const).map(name => { const scoped = filtered.filter(row => row.tool === name), total = scoped.reduce((sum, row) => sum + row.tokens, 0); return <div key={name} className="ops-tool-stat"><RobotOutlined /><div><strong>{name}</strong><span>{t('home.tools.usageLine', { used: new Set(scoped.filter(row => row.used).map(row => row.memberId)).size, running: new Set(scoped.filter(row => row.status === '执行中').map(row => row.memberId)).size })}</span></div><b>{formatTokens(total)}</b></div>; })}</FrameworkCard><FrameworkCard title={t('home.tools.state')}>{(['执行中', '等待人工处理', '在线空闲', '离线', '未使用'] as const).map(name => <div className="ops-state-row" key={name}><Tag color={statusColor[name]}>{presenceLabel(name)}</Tag><span>{t('home.tools.recordCount', { count: filtered.filter(row => row.status === name).length })}</span></div>)}</FrameworkCard></div><FrameworkCard title={owner ? t('home.tools.memberTitle') : t('home.tools.mineTitle')} action={owner ? <Origin kind="native" /> : <Button onClick={() => navigate('agent')}>{t('home.tools.manageLocal')}</Button>}>{owner ? <><h3 className="ops-section-title">{t('home.tools.localInstall')}</h3><div className="ops-local-agents">{localAgents.map(agent => <div key={agent.name}><strong>{agent.name}</strong><Tag color={agent.installed ? 'green' : undefined}>{nativeToolsError ? t('home.tools.unverified') : agent.installed === undefined ? t('home.tools.probing') : agent.installed ? t('home.tools.installed') : t('home.tools.notInstalled')}</Tag><small>{nativeToolsError ? t('home.tools.checkService') : agent.version ?? (agent.installed === undefined ? t('home.tools.readingState') : t('home.tools.noVersion'))}</small></div>)}</div><h3 className="ops-section-title">{t('home.tools.memberSessions')}</h3>{agentFiltered.length ? memberAgentTable : <div className="ops-compact-empty">{t('home.tools.noSessions')}</div>}<p className="ops-subnote">{t('home.tools.sessionNote')}</p>{nativeToolsError && <p className="ops-subnote">{t('home.tools.probeFailed', { error: nativeToolsError })}</p>}</> : usageTable}</FrameworkCard></>}
    {tab === 'tokens' && <>
      <div className="metrics-row ops-metrics"><MiniStat label={t('home.tokens.total')} value={formatTokens(tokens)} note={period === 'today' ? t('home.tokens.todayTotal') : t('home.tokens.weekTotal')} /><MiniStat label={t('home.tokens.input')} value={formatTokens(input)} note={t('home.tokens.inputNote')} /><MiniStat label={t('home.tokens.output')} value={formatTokens(tokens - input)} note={t('home.tokens.outputNote')} /><MiniStat label={t('home.tokens.average')} value={formatTokens(active ? Math.round(tokens / active) : 0)} note={t('home.tokens.averageNote')} /></div>
      <div className="ops-two"><FrameworkCard title={period === 'today' ? t('home.tokens.todayDist') : t('home.tokens.weekTrend')} action={<Origin kind="simulated" />}><TokenTrend total={tokens} days={period === 'today' ? 1 : 7} /></FrameworkCard><FrameworkCard title={t('home.tokens.byMember')}><div className="ops-bars">{tokenPeople.map(id => { const scoped = filtered.filter(row => row.memberId === id), sum = scoped.reduce((n, row) => n + row.tokens, 0); return <div key={id}><div><span>{scoped[0].name}</span><strong>{formatTokens(sum)}</strong></div><div className="ops-bar-track"><i style={{ width: `${tokens ? sum / tokens * 100 : 0}%` }} /></div></div>; })}{!tokenPeople.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.tokens.noUsage')} />}{zeroTokenPeople > 0 && <p className="ops-subnote">{t('home.tokens.zeroNote', { count: zeroTokenPeople })}</p>}</div></FrameworkCard></div>
      <FrameworkCard title={t('home.tokens.detail')} action={<Tag>{period === 'today' ? t('home.tokens.rangeToday') : t('home.tokens.rangeWeek')}</Tag>}><Table<UsageRow> rowKey="id" size="middle" pagination={false} scroll={{ x: 700 }} dataSource={filtered.filter(row => row.tokens > 0)} columns={[{ title: t('home.table.member'), dataIndex: 'name', width: 90 }, { title: t('home.tokens.toolModel'), key: 'tool', render: (_, row) => <div className="ops-table-person"><strong>{row.tool}</strong><small>{row.model}</small></div> }, { title: t('home.tokens.project'), dataIndex: 'project' }, { title: t('home.tokens.inputCol'), key: 'input', render: (_, row) => row.input.toLocaleString() }, { title: t('home.tokens.outputCol'), key: 'output', render: (_, row) => row.output.toLocaleString() }, { title: t('home.tokens.linkedJob'), key: 'open', render: (_, row) => <Button size="small" type="link" onClick={() => setSelected(row)}>{t('home.tokens.viewDetail')}</Button> }]} /><p className="ops-subnote">{t('home.tokens.note')}</p></FrameworkCard>
    </>}
    <Drawer title={t('home.tokens.detailTitle')} open={!!selected} onClose={() => setSelected(null)} width={540}>{selected && <><Origin kind="simulated" /><h2>{selected.name} · {selected.tool}</h2><Descriptions column={1} bordered size="small" items={[{ key: 'status', label: t('home.table.status'), children: <Tag color={statusColor[selected.status]}>{presenceLabel(selected.status)}</Tag> }, { key: 'task', label: t('home.tokens.task'), children: displayText(selected.task) }, { key: 'project', label: t('home.tokens.project'), children: selected.project }, { key: 'model', label: t('home.tokens.model'), children: selected.model }, { key: 'period', label: t('home.tokens.period'), children: selected.days === 1 ? t('home.tokens.rangeToday') : t('home.tokens.rangeWeek') }, { key: 'input', label: t('home.tokens.input'), children: selected.input.toLocaleString() }, { key: 'output', label: t('home.tokens.output'), children: selected.output.toLocaleString() }, { key: 'active', label: t('home.tokens.active'), children: selected.lastActive }]} /><div className="card-actions">{selected.memberId === 'member' ? <><Button type="primary" onClick={() => { setSelected(null); navigate('projects?tab=delivery&node=develop'); }}>{t('home.tokens.viewCashback')}</Button><Button onClick={() => { setSelected(null); navigate('trace?project=carddemo&task=' + encodeURIComponent(focus?.id ?? 'DEMO-MKT-001')); }}>{t('home.tokens.linkedTrace')}</Button></> : <p className="muted">{t('home.tokens.noMore')}</p>}</div></>}</Drawer>
  </div>;
}
function DeliverySteps({ task }: { task?: ProjectDeliveryTask }) {
  const t = useT();
  const record = task?.record;
  const current = record ? ['prepare', 'develop', 'verify', 'accept'].indexOf(requirementNode(record)) : 0;
  const status = !record || !record.assigneeId ? 'wait' : record.stage === 'accepted' ? 'finish' : record.stage === 'returned' || Object.values(record.nodes).some(node => node.status === 'blocked') ? 'error' : 'process';
  return <Steps size="small" current={current} status={status} items={[{ title: t('home.steps.clarify') }, { title: t('home.steps.develop') }, { title: t('home.steps.verify') }, { title: t('home.steps.accept') }]} />;
}

function TokenTrend({ total, days }: { total: number; days: number }) {
  const t = useT();
  const weights = days === 1 ? [4, 12, 20, 16, 27, 21] : [9, 13, 11, 18, 16, 14, 19];
  const labels = days === 1 ? ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'] : ['10/20', '10/21', '10/22', '10/23', '10/24', '10/25', '10/26'];
  return <div className="ops-trend" role="img" aria-label={t(days === 1 ? 'home.trend.ariaToday' : 'home.trend.ariaWeek', { total })}><div className="ops-trend-bars">{weights.map((weight, index) => <div className="ops-trend-column" key={labels[index]}><small>{formatTokens(Math.round(total * weight / 100))}</small><div><i style={{ height: total ? `${weight / Math.max(...weights) * 100}%` : '0%' }} /></div><span>{labels[index]}</span></div>)}</div></div>;
}
