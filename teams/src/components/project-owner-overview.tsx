import { ProjectWorkspaceSummary } from './project-workspace-summary.js';
import { displayText } from '../display-text.js';
import '../project-overview.css';
import { useState, type ReactNode } from 'react';
import { Button, Drawer, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { projectOverview, type OverviewRequirement } from '../project-overview.js';
import { ProjectKnowledge } from './project-knowledge.js';
import { metricGroups, Report, taskManagementRoute } from './project-task-shared.js';
import { userSkillsFor } from './project-skills.js';


export function OwnerProjectOverview({ projectId, resources, skillContent, skillCount, origin }: { projectId: string; resources: ReactNode; skillContent: ReactNode; skillCount: number; origin?: ReactNode }) {
  const { state, data, role, navigate } = useDemo();
  const t = useT();
  const model = projectOverview(state, data, projectId);
  const [panel, setPanel] = useState<'resources' | 'skills' | null>(new URLSearchParams(location.hash.split('?')[1] ?? '').get('panel') === 'resources' ? 'resources' : null);
  const unknownIssues = model.counts.unconfirmed;
  const setDetail = (item: OverviewRequirement | typeof model.issues[number]) => navigate(taskManagementRoute(projectId, 'phase' in item ? item.source.requirement?.category === 'research' ? 'general' : 'requirements' : 'issues', { item: item.id }));
  const jump = (item: OverviewRequirement) => setDetail(item);
  const todos = [
    ...model.requirements.filter(item => item.pendingConfirmation).map(item => ({ id: item.id, label: t('ov.todo.pendingRequirement'), title: item.source.title, act: () => jump(item) })),
    ...model.requirements.filter(item => item.phase === '待验收').map(item => ({ id: item.id, label: t('ov.todo.acceptance'), title: item.source.title, act: () => jump(item) })),
    ...[...model.requirements, ...model.research].filter(item => item.activity?.phase === 'blocked').map(item => ({ id: 'report-' + item.id, label: t('ov.todo.blockedWork'), title: item.source.title, act: () => setDetail(item) })),
    ...(model.projectActivity?.phase === 'blocked' ? [{ id: 'project-report', label: t('ov.todo.projectBlocked'), title: model.projectActivity.summary, act: () => navigate(taskManagementRoute(projectId, 'general')) }] : []),
    ...model.issues.filter(item => item.blocksDelivery).map(item => ({ id: item.id, label: t('ov.todo.blocking'), title: item.source.title, act: () => setDetail(item) })),
    ...(projectId === 'teams' ? data.teamsProject.discussions.filter(item => item.owner === 'A' && ['review', 'waiting'].includes(item.status)).map(item => ({ id: item.id, label: t('ov.todo.discussion'), title: item.title, act: () => navigate('projects?' + new URLSearchParams({ project: projectId, tab: 'management', category: 'issues', discussion: item.id })) })) : []),
  ];
  return <div className="page-stack project-owner-overview" data-owner-project={projectId}>
    <div className="overview-header"><span><strong>{t('ov.header')}</strong>{origin}</span><Button onClick={() => setPanel('resources')}>{t('ov.projectMaterials')}</Button></div>
    <ProjectWorkspaceSummary key={projectId} projectId={projectId}/>
    <div className="overview-metric-groups" aria-label={t('ov.metricsAria')}>{metricGroups().map(group => <section key={group.tab} className="overview-metric-group" data-overview-group={group.tab} aria-label={group.title}>
      <div className="overview-metric-heading"><h3>{group.title}</h3><span>{group.note}</span></div>
      <div className="overview-metrics">{group.metrics.map(metric => <Button key={metric.key} data-metric={metric.key} aria-label={metric.label} onClick={() => navigate(taskManagementRoute(projectId, group.tab, { filter: metric.key }))}><span>{metric.label}</span><strong>{model.counts[metric.key]}</strong></Button>)}</div>
    </section>)}</div>
    <div className="overview-scope"><span>{displayText(model.scope)}</span>{unknownIssues > 0 && <span>{t('ov.unconfirmedNote', { count: unknownIssues })}</span>}</div>
    <div className="overview-todos" aria-label={t('ov.todosAria')}><strong>{t('ov.todos')} <Tag>{todos.length}</Tag></strong>{todos.length ? todos.map(item => <Button key={item.id} size="small" onClick={item.act} aria-label={t('ov.todoAria', { label: item.label, title: item.title })}><span className="muted">{item.label}</span> · {item.title}</Button>) : <span className="muted">{t('ov.noTodos')}</span>}</div>
    <div className="overview-preparation"><ProjectKnowledge projectId={projectId} compact /><div className="overview-skill-summary"><strong>{t('ov.availableSkill')}</strong><span>{t('ov.skillSummary', { project: skillCount, user: userSkillsFor(state, data, role).length })}</span><Button size="small" onClick={() => setPanel('skills')}>{t('ov.viewSkill')}</Button></div></div>
    {model.projectActivity && <div className="overview-project-report"><span className="muted">{t('ov.recentReport')}</span><Report event={model.projectActivity} /></div>}
    <Drawer className="owner-project-panel" title={panel === 'skills' ? t('ov.skillDrawer') : t('ov.projectMaterials')} width={940} open={!!panel} onClose={() => setPanel(null)} destroyOnHidden><div className="page-stack project-detail">{panel === 'skills' ? skillContent : resources}</div></Drawer>

  </div>;
}
