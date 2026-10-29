import { ProjectWorkspaceSummary } from './project-workspace-summary.js';
import { displayText } from '../display-text.js';
import '../project-overview.css';
import { useState, type ReactNode } from 'react';
import { Button, Drawer, Tag } from 'antd';
import { useDemo } from '../context.js';
import { projectOverview, type OverviewRequirement } from '../project-overview.js';
import { ProjectKnowledge } from './project-knowledge.js';
import { metricGroups, Report, taskManagementRoute } from './project-task-shared.js';
import { userSkillsFor } from './project-skills.js';


export function OwnerProjectOverview({ projectId, resources, skillContent, skillCount, origin }: { projectId: string; resources: ReactNode; skillContent: ReactNode; skillCount: number; origin?: ReactNode }) {
  const { state, data, role, navigate } = useDemo();
  const model = projectOverview(state, data, projectId);
  const [panel, setPanel] = useState<'resources' | 'skills' | null>(new URLSearchParams(location.hash.split('?')[1] ?? '').get('panel') === 'resources' ? 'resources' : null);
  const unknownIssues = model.counts.unconfirmed;
  const setDetail = (item: OverviewRequirement | typeof model.issues[number]) => navigate(taskManagementRoute(projectId, 'phase' in item ? item.source.requirement?.category === 'research' ? 'general' : 'requirements' : 'issues', { item: item.id }));
  const jump = (item: OverviewRequirement) => setDetail(item);
  const todos = [
    ...model.requirements.filter(item => item.pendingConfirmation).map(item => ({ id: item.id, label: '待确认需求', title: item.source.title, act: () => jump(item) })),
    ...model.requirements.filter(item => item.phase === '待验收').map(item => ({ id: item.id, label: '待验收成果', title: item.source.title, act: () => jump(item) })),
    ...[...model.requirements, ...model.research].filter(item => item.activity?.phase === 'blocked').map(item => ({ id: 'report-' + item.id, label: '作业待协调', title: item.source.title, act: () => setDetail(item) })),
    ...(model.projectActivity?.phase === 'blocked' ? [{ id: 'project-report', label: '项目作业待协调', title: model.projectActivity.summary, act: () => navigate(taskManagementRoute(projectId, 'general')) }] : []),
    ...model.issues.filter(item => item.blocksDelivery).map(item => ({ id: item.id, label: '需协调阻塞', title: item.source.title, act: () => setDetail(item) })),
    ...(projectId === 'teams' ? data.teamsProject.discussions.filter(item => item.owner === 'A' && ['review', 'waiting'].includes(item.status)).map(item => ({ id: item.id, label: '待确认讨论标准', title: item.title, act: () => navigate('projects?' + new URLSearchParams({ project: projectId, tab: 'management', category: 'issues', discussion: item.id })) })) : []),
  ];
  return <div className="page-stack project-owner-overview" data-owner-project={projectId}>
    <div className="overview-header"><span><strong>交付概览</strong>{origin}</span><Button onClick={() => setPanel('resources')}>项目资料</Button></div>
    <ProjectWorkspaceSummary key={projectId} projectId={projectId}/>
    <div className="overview-metric-groups" aria-label="项目交付指标">{metricGroups.map(group => <section key={group.tab} className="overview-metric-group" data-overview-group={group.tab} aria-label={group.title}>
      <div className="overview-metric-heading"><h3>{group.title}</h3><span>{group.note}</span></div>
      <div className="overview-metrics">{group.metrics.map(metric => <Button key={metric.key} data-metric={metric.key} aria-label={metric.label} onClick={() => navigate(taskManagementRoute(projectId, group.tab, { filter: metric.key }))}><span>{metric.label}</span><strong>{model.counts[metric.key]}</strong></Button>)}</div>
    </section>)}</div>
    <div className="overview-scope"><span>{displayText(model.scope)}</span>{unknownIssues > 0 && <span>{unknownIssues} 项问题关闭状态待确认，单独计数，不纳入未关闭或已关闭数量。</span>}</div>
    <div className="overview-todos" aria-label="Owner 待我处理"><strong>待我处理 <Tag>{todos.length}</Tag></strong>{todos.length ? todos.map(item => <Button key={item.id} size="small" onClick={item.act} aria-label={item.label + '：' + item.title}><span className="muted">{item.label}</span> · {item.title}</Button>) : <span className="muted">暂无待确认或待协调事项</span>}</div>
    <div className="overview-preparation"><ProjectKnowledge projectId={projectId} compact /><div className="overview-skill-summary"><strong>可用 Skill</strong><span>{skillCount} 项项目 Skill · {userSkillsFor(state, data, role).length} 项用户 Skill</span><Button size="small" onClick={() => setPanel('skills')}>查看 Skill</Button></div></div>
    {model.projectActivity && <div className="overview-project-report"><span className="muted">最近项目级回传</span><Report event={model.projectActivity} /></div>}
    <Drawer className="owner-project-panel" title={panel === 'skills' ? '项目可用 Skill' : '项目资料'} width={940} open={!!panel} onClose={() => setPanel(null)} destroyOnHidden><div className="page-stack project-detail">{panel === 'skills' ? skillContent : resources}</div></Drawer>

  </div>;
}
