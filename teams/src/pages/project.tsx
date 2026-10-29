import { projectTasksVisibleTo } from '../task-visibility.js';
import { preferredDeliveryTask, projectDeliveryTasks } from '../project-delivery-tasks.js';
import { DeliveryTaskSidebar } from '../components/delivery-task-sidebar.js';
import { LiveTaskDelivery } from '../components/live-task-delivery.js';
import { TaskExecutionRecords } from '../components/task-execution-records.js';
import { projectMembers, projectTeam } from '../teams-domain.js';
import { displayProjectDescription, displayText } from '../display-text.js';
import { Alert, Button, Descriptions, Empty, Space, Tag } from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { Heading } from '../components/common.js';
import { ProjectToolbar } from '../components/project-toolbar.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { ProjectWorkLaunch } from '../components/project-work-launch.js';
import { TeamsProjectCard } from './teams-project.js';
import { CreateProjectButton, CreatedProjectCard } from './created-project.js';
import { ProjectContent, ProjectManagement, ProjectSettings } from './project-content.js';
import { ProjectDelivery, nodeLabels, type DeliveryNode } from './project-delivery.js';
import '../project.css';

export function Project({ tab = 'content', node }: { tab?: string; node?: string }) {
  const { state, role, navigate } = useDemo();
  const t = useT();
  const mainDelivery=projectDeliveryTasks(state,'carddemo').find(task=>task.id==='DEMO-MKT-001');
  if (tab === 'list') return <div className="page-stack project-workspace"><Heading eyebrow={t('pj.eyebrow')} title={t('pj.title')} description={role === 'owner' ? t('pj.descOwner') : t('pj.descMember')} actions={role === 'owner' ? <CreateProjectButton /> : undefined} />
    <FrameworkCard title={state.workspace.project.name} action={<Tag color={mainDelivery?.accepted ? 'green' : 'purple'}>{mainDelivery?.status}</Tag>}><p>{displayText(displayProjectDescription(state.workspace.project.description))}</p><Descriptions size="small" column={2} items={[{ key: 'team', label: t('pj.team'), children: projectTeam(state, 'carddemo').name }, { key: 'people', label: t('pj.roles'), children: projectMembers(state, 'carddemo').filter(member => member.status === 'active').map(member => member.name + ' · ' + (member.role === 'owner' ? 'Owner' : t('pj.member'))).join(t('common.listSeparator')) }, { key: 'repository', label: t('pj.repo'), children: state.workspace.project.repository }, { key: 'task', label: t('pj.currentRequirement'), children: '信用卡消费返现 · MKT-001' }]} /><Space wrap><Button type="primary" data-project-primary="carddemo" aria-label={(role === 'owner' ? t('pj.enterManagementAria', { name: state.workspace.project.name }) : t('pj.enterDeliveryAria', { name: state.workspace.project.name }))} onClick={() => navigate('projects?tab=' + (role === 'owner' ? 'management' : 'delivery'))}>{role === 'owner' ? t('pj.enterManagement') : t('pj.enterDelivery')}</Button><Button onClick={() => navigate('projects?tab=content')}>{t('pj.materials')}</Button>{role === 'owner' && <Button onClick={() => navigate('projects?tab=delivery')}>{t('pj.deliveryAcceptance')}</Button>}{role === 'owner' && <Button onClick={() => navigate('projects?tab=settings')}>{t('pj.editProject')}</Button>}</Space></FrameworkCard>
    <TeamsProjectCard />
    {(state.workspace.projects ?? []).map(project => <CreatedProjectCard key={project.id} project={project} />)}
  </div>;
  if (!projectTasksVisibleTo(state, 'carddemo', role)) return <Alert type="info" title={t('pj.outOfScope')} description={t('pj.outOfScopeDesc')} />;
  const tasks = projectDeliveryTasks(state, 'carddemo', role);
  const requestedTask = new URLSearchParams(location.hash.split('?')[1] ?? '').get('task');
  const selected = requestedTask ? tasks.find(task => task.id === requestedTask) : preferredDeliveryTask(tasks, role);
  const taskId = selected?.id;
  const task = selected?.record;
  const legacy = tab === 'requirement' ? 'management' : ['context', 'acceptance'].includes(tab) ? 'delivery' : tab;
  const selectedNode: DeliveryNode = tab === 'context' ? 'prepare' : tab === 'acceptance' ? 'accept' : node && Object.hasOwn(nodeLabels, node) ? node as DeliveryNode : selected?.node ?? 'prepare';
  return <div className="page-stack project-workspace project-detail">
    <ProjectToolbar activeKey={legacy} onChange={value => navigate('projects?project=carddemo&tab=' + value + (value === 'delivery' && selected ? '&task=' + encodeURIComponent(selected.id) : ''))} actions={<>
      {task ? <TaskExecutionRecords key={task.projectId + ':' + task.id + ':' + role} task={task} /> : selected ? <Button type="text" icon={<FileTextOutlined />} aria-label={t('pj.viewExecutionAria')} title={t('pj.viewExecutionAria')} onClick={() => navigate('trace')}><span className="project-secondary-action-label">{t('pj.executionRecords')}</span></Button> : null}
      <Button type="text" icon={<SettingOutlined />} aria-label={t('pj.projectSettings')} title={t('pj.projectSettings')} onClick={() => navigate('projects?tab=settings')}><span className="project-secondary-action-label">{t('pj.projectSettings')}</span></Button>
      {(legacy !== 'delivery' || selected) && <ProjectWorkLaunch target={{ projectId: 'carddemo', tab: legacy, ...(legacy === 'delivery' ? { taskId, nodeId: selectedNode } : {}) }} />}
    </>} />
    {legacy === 'content' ? <ProjectContent /> : legacy === 'management' ? <ProjectManagement /> : legacy === 'delivery' ? task ? <LiveTaskDelivery key={task.projectId+':'+task.id+':'+role} task={task} node={selectedNode}/> : taskId==='DEMO-MKT-001'?<ProjectDelivery node={selectedNode} />:<div className="project-delivery-layout without-background"><DeliveryTaskSidebar projectId="carddemo" selectedTaskId="" /><div className="project-node-main">{requestedTask ? <Alert type="info" title={t('pj.taskMissing')} action={<Button onClick={() => navigate('projects?project=carddemo&tab=delivery')}>{t('pj.viewProjectTasks')}</Button>} /> : <Empty description={t('pj.noDeliveryTasks')} />}</div></div> : legacy === 'settings' ? <><Button className="self-start" icon={<ArrowLeftOutlined />} onClick={() => navigate('projects?tab=content')}>{t('pj.backToOverview')}</Button><ProjectSettings /></> : <Alert type="error" title={t('pj.pageMissing')} action={<Button onClick={() => navigate('projects?tab=content')}>{t('pj.goOverview')}</Button>} />}

  </div>;
}
