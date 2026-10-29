import { Button, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { displayRequirementId } from '../display-text.js';
import { projectDeliveryTasks, orderDeliveryTasks } from '../project-delivery-tasks.js';
import { taskExecutableBy } from '../task-visibility.js';
import './delivery-task-sidebar.css';

export interface DeliveryTaskListItem { id: string; title: string; owner: string; assigneeId?: string | null; status: string; route: string; accepted: boolean; createdAt?: string }
export function DeliveryTaskSidebar({ projectId, selectedTaskId, items }: { projectId: string; selectedTaskId: string; items?: readonly DeliveryTaskListItem[] }) {
  const { state, role, navigate } = useDemo();
  const t = useT();
  const tasks = orderDeliveryTasks(items ?? projectDeliveryTasks(state, projectId, role));
  const groups = [{ id: 'mine', title: t('dts.mine'), tasks: tasks.filter(task => taskExecutableBy(role, task.assigneeId)) }, { id: 'others', title: t('dts.others'), tasks: tasks.filter(task => !taskExecutableBy(role, task.assigneeId)) }];
  return <aside className="project-task-list project-delivery-sidebar" aria-label={t('dts.listAria')} data-task-count={tasks.length}>
    <div className="project-column-title">{t('dts.title')} <Tag>{tasks.length}</Tag></div>
    <nav aria-label={t('dts.selectAria')}>{groups.map(group => <section key={group.id} data-task-group={group.id} data-group-count={group.tasks.length} aria-label={group.title}><h3>{group.title}<Tag>{group.tasks.length}</Tag></h3>{!group.tasks.length && <p className="delivery-task-group-empty">{group.id === 'mine' ? t('dts.emptyMine') : t('dts.emptyOthers')}</p>}{group.tasks.map(task => <button type="button" key={task.id} data-delivery-task={task.id} className="project-selected-task" aria-current={task.id === selectedTaskId ? 'page' : undefined} onClick={() => navigate(task.route)}>
      <small title={displayRequirementId(task.id)}>{displayRequirementId(task.id)}</small><strong title={task.title}>{task.title}</strong><span className="delivery-task-meta"><Tag color={task.accepted ? 'green' : 'purple'} title={task.status}>{task.status}</Tag><span title={t('dts.assignee', { name: task.owner })}>{t('dts.assignee', { name: task.owner })}</span></span>
    </button>)}</section>)}</nav>
    <Button type="link" onClick={() => navigate('projects?' + new URLSearchParams({ project: projectId, tab: 'management' }))}>{t('dts.backToList')}</Button>
  </aside>;
}
