import { displayText, displayRequirementId } from '../display-text.js';
import '../project-overview.css';
import { Alert, Button, Descriptions, Drawer, Empty, Select, Space, Table, Tabs, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { filterIssues, filterRequirements, projectOverview, type OverviewFilter, type OverviewIssue, type OverviewRequirement } from '../project-overview.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { RequirementDetail, requirementPhaseLabel } from './requirement-detail.js';
import { metricGroups, taskManagementRoute, type TaskCategory } from './project-task-shared.js';
import { ProjectTaskCreate } from './project-task-create.js';
import { GeneralTasks } from './project-general-tasks.js';
import { projectTasksVisibleTo, visibleGenericTasks } from '../task-visibility.js';

export function ProjectTaskManagement({ projectId }: { projectId: string }) {
  const { state, data, role, navigate, showText } = useDemo();
  const t = useT();
  if (!projectTasksVisibleTo(state, projectId, role)) return <Alert type="info" title={t('ovm.outOfScopeAlert')} />;
  const model = projectOverview(state, data, projectId, undefined, role);
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const rawCategory = params.get('category') ?? (model.research.some(item => item.id === params.get('item')) ? 'general' : params.has('discussion') || params.get('view') === 'discussion' ? 'issues' : 'requirements');
  const tab: TaskCategory = rawCategory === 'issues' || rawCategory === 'general' ? rawCategory : 'requirements';
  const group = metricGroups().find(item => item.tab === tab);
  const defaultFilter = tab === 'issues' ? 'issues' : 'all';
  const filter: OverviewFilter = group?.metrics.some(item => item.key === params.get('filter')) ? params.get('filter') as OverviewFilter : defaultFilter;
  const related = tab === 'issues' ? params.get('requirement') : null;
  const go = (category: TaskCategory, extra: Record<string, string> = {}) => navigate(taskManagementRoute(projectId, category, extra));
  const preserved = { ...(filter !== defaultFilter ? { filter } : {}), ...(related ? { requirement: related } : {}) };
  const setDetail = (item: OverviewRequirement | OverviewIssue | null) => {
    const category = item ? 'phase' in item ? item.source.requirement?.category === 'research' ? 'general' : 'requirements' : 'issues' : tab;
    go(category, { ...(category === tab ? preserved : {}), ...(item ? { item: item.id } : {}) });
  };
  const detailItems = tab === 'requirements' ? model.requirements : tab === 'issues' ? model.issues : model.research;
  const detail = detailItems.find(item => item.id === params.get('item')) ?? null;
  const requirements = filterRequirements(model, filter);
  const issues = filterIssues(model, filter).filter(item => !related || item.relatedIds.includes(related));
  const genericTasks = visibleGenericTasks(state, projectId, role);
  const generalCount = model.research.length + genericTasks.length;
  const discussion = projectId === 'teams' && tab === 'issues' && params.get('discussion') ? data.teamsProject.discussions.find(item => item.id === params.get('discussion')) : undefined;
  const outsideScope = !!(params.get('item') || params.get('discussion')) && !detail && !discussion && !genericTasks.some(task => task.id === params.get('item'));
  const visibleCount = tab === 'requirements' ? requirements.length : tab === 'issues' ? issues.length : generalCount;
  const totalCount = tab === 'requirements' ? model.counts.all : tab === 'issues' ? model.counts.issues : generalCount;
  const filterLabel = group?.metrics.find(metric => metric.key === filter)?.label ?? t('ovm.genericFallback');
  const summaryKey = tab === 'requirements' ? 'ovm.summaryRequirements' : tab === 'issues' ? 'ovm.summaryIssues' : 'ovm.summaryGeneral';
  const empty = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === defaultFilter && !related ? tab === 'requirements' ? t('ovm.emptyNoRequirements') : t('ovm.emptyNoIssues') : t('ovm.emptyFiltered')} />;
  return <div className="page-stack project-task-management" data-task-project={projectId}>
    {outsideScope && <Alert type="info" title={t('ovm.itemMissing')} action={<Button onClick={() => go(tab)}>{t('ovm.viewProjectTasks')}</Button>} />}
    <p className="muted">{t('ovm.intro')}</p>
    <FrameworkCard title={t('ovm.title')} action={<Space wrap>{tab !== 'general' && role === 'owner' && <ProjectTaskCreate key={projectId + ':' + role + ':' + tab} projectId={projectId} kind={tab === 'requirements' ? 'requirement' : 'issue'} onCreated={() => go(tab)} />}<span className="muted" data-overview-list-summary data-list-count={visibleCount} data-list-total={totalCount}>{t(summaryKey, { label: filterLabel, visible: visibleCount, total: totalCount })}</span>{group && <Select aria-label={tab === 'requirements' ? t('ovm.filterRequirements') : t('ovm.filterIssues')} value={filter} onChange={value => go(tab, { ...preserved, filter: value })} options={group.metrics.map(metric => ({ value: metric.key, label: metric.label }))} />}{(filter !== defaultFilter || related) && <Button size="small" onClick={() => go(tab)}>{t('ovm.clearFilter')}</Button>}</Space>}>
      {related && <p className="muted">{t('ovm.relatedOnly', { title: model.requirements.find(item => item.id === related)?.source.title ?? related })}</p>}
      <Tabs activeKey={tab} onChange={value => go(value as TaskCategory)} items={[{ key: 'requirements', label: t('ovm.tabRequirements', { count: model.counts.all }) }, { key: 'issues', label: t('ovm.tabIssues', { count: model.counts.issues }) }, { key: 'general', label: t('ovm.tabGeneral', { count: generalCount }) }]} />
      {tab === 'requirements' ? <Table<OverviewRequirement> className="overview-requirements" rowKey="id" size="small" pagination={false} scroll={{ x: 620 }} dataSource={requirements} locale={{ emptyText: empty }} columns={[
        { title: t('ovm.colRequirement'), width: 240, render: (_, item) => <><Button type="link" className="overview-title" onClick={() => setDetail(item)}>{item.source.title}</Button><small className="muted">{displayRequirementId(item.taskId ?? item.source.sourceRecordId)}</small></> },
        { title: t('ovm.colAssignee'), width: 100, dataIndex: 'owner' },
        { title: t('ovm.colStatus'), width: 140, render: (_, item) => <Tag color={item.phase === '已交付' ? 'green' : item.phase === '待验收' ? 'gold' : undefined}>{item.deliveryStatus ?? requirementPhaseLabel(item.phase)}</Tag> },
        { title: t('ovm.colDue'), width: 110, render: (_, item) => <>{item.due ?? t('ovm.unscheduled')}{item.overdue && <small className="overview-overdue">{projectId === 'teams' ? t('ovm.overdueSnapshot') : t('ovm.overdue')}</small>}</> },
      ]} /> : tab === 'issues' ? <Table<OverviewIssue> className="overview-issues" rowKey="id" size="small" pagination={false} scroll={{ x: 900 }} dataSource={issues} locale={{ emptyText: empty }} columns={[
        { title: t('ovm.colIssue'), width: 240, render: (_, item) => <><Button type="link" className="overview-title" onClick={() => setDetail(item)}>{item.source.title}</Button><small className="muted">{item.source.sourceRecordId}</small></> },
        { title: t('ovm.colSeverity'), width: 90, dataIndex: 'severity' }, { title: t('ovm.colStatus'), width: 155, render: (_, item) => <Tag color={item.blocksDelivery ? 'red' : item.closed === true ? 'green' : undefined}>{item.status}</Tag> },
        { title: t('ovm.colOwner'), width: 110, dataIndex: 'owner' },
        { title: t('ovm.colLinks'), width: 150, render: (_, item) => <><span>{item.relatedIds.map(id => model.requirements.find(requirement => requirement.id === id)?.source.title ?? t('ovm.sourceNotLinked')).join(t('common.listSeparator'))}</span>{item.blocksDelivery && <Tag color="red">{t('ov.metric.blocking')}</Tag>}</> },
        { title: t('ovm.colProgress'), dataIndex: 'progress' },
      ]} /> : <GeneralTasks projectId={projectId} research={model.research} />}
      {tab !== 'general' && !model.requirements.length && !model.issues.length && <Button onClick={() => navigate('projects?' + new URLSearchParams({ project: projectId, tab: 'content', panel: 'resources' }))}>{t('ovm.viewMaterials')}</Button>}
      {model.requirements.some(item => item.due) && <p className="muted">{t('ovm.dueNote', { date: model.asOf })}</p>}
    </FrameworkCard>
    {projectId === 'teams' && <FrameworkCard title={discussion ? discussion.id + ' · ' + discussion.title : t('ovm.originRecord')}>{discussion && <><p>{displayText(discussion.summary)}</p><Button onClick={() => showText(t('ovm.discussionTitle', { id: discussion.id }), JSON.stringify(discussion, null, 2))}>{t('ovm.viewDiscussion')}</Button></>}<Space wrap><Button onClick={() => showText(t('ovm.teamsInputs'), JSON.stringify(data.teamsProject.inputs, null, 2))}>{t('ovm.viewInputs')}</Button><Button onClick={() => showText(t('ovm.teamsDiscussions'), JSON.stringify(data.teamsProject.discussions, null, 2))}>{t('ovm.viewDiscussions')}</Button></Space><p className="muted">{t('ovm.retainedNote')}</p></FrameworkCard>}
    <Drawer title={detail?.source.title ?? t('ovm.drawerTitle')} width={740} open={!!detail} onClose={() => setDetail(null)} destroyOnHidden>{detail && <div className="page-stack">
      {'phase' in detail ? <RequirementDetail key={projectId + ':' + detail.id + ':' + role} projectId={projectId} item={detail} /> : <>
        <p className="muted">{t('ovm.sourceLabel', { source: detail.source.origin === 'teams-task' ? 'Teams' : t('ovm.issuePlatform'), id: detail.source.sourceRecordId })}</p><p>{displayText(detail.source.summary)}</p>
        <Descriptions column={1} size="small" items={[{ key: 'status', label: t('ovm.colStatus'), children: detail.status }, { key: 'severity', label: t('ovm.colSeverity'), children: detail.severity }, { key: 'owner', label: t('ovm.colOwner'), children: detail.owner }, { key: 'progress', label: t('ovm.detailProgress'), children: detail.progress }, { key: 'blocking', label: t('ovm.deliveryImpact'), children: detail.blocksDelivery ? t('ovm.blockingCurrent') : t('ovm.noBlocking') }]} />
        <Space wrap>{detail.relatedIds.map(id => { const requirement = model.requirements.find(item => item.id === id); return requirement ? <Button type="link" size="small" key={id} onClick={() => setDetail(requirement)}>{t('ovm.linkedRequirement', { title: requirement.source.title })}</Button> : null; })}{projectId === 'teams' && detail.source.sourceRecordId === 'TEAMS-BUG-001' && <Button type="link" onClick={() => navigate('projects?project=teams&tab=management&discussion=R20')}>{t('ovm.viewR20')}</Button>}<Button type="link" onClick={() => showText(t('ovm.sourceOriginal', { title: detail.source.title }), displayText(detail.source.detail))}>{t('ovm.viewSource')}</Button></Space>
      </>}
    </div>}</Drawer>
  </div>;
}
