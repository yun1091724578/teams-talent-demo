import { displayRequirementId } from '../display-text.js';
import { Button, Empty, Tag, Timeline } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { projectDeliveryTasks } from '../project-delivery-tasks.js';

export function CollaborationProgress({ projectId, taskId, nodeId, embedded = false }: { projectId: string; taskId: string; nodeId?: string; embedded?: boolean }) {
  const { state, role, showText } = useDemo();
  const t = useT();
  const phases = { started: t('cp.started'), progress: t('cp.progress'), blocked: t('cp.blocked'), result: t('cp.result') };
  if (role === 'member' && !projectDeliveryTasks(state, projectId, role).some(task => task.id === taskId)) return null;
  const inScope = (record: { projectId: string; taskId?: string; nodeId?: string }) => record.projectId === projectId && record.taskId === taskId && (!nodeId || record.nodeId === nodeId);
  const events = (state.workspace.collaboration?.events ?? []).filter(inScope);
  const adoptions = (state.workspace.collaboration?.adoptions ?? []).filter(inScope);
  const content = <>
    {adoptions.length > 0 && <Button type="link" onClick={() => showText(t('cp.adoptionsTitle', { id: displayRequirementId(taskId) }) + (nodeId ? ' · ' + nodeId : ''), JSON.stringify(adoptions, null, 2))}>{t('cp.viewAdoptions', { count: adoptions.length })}</Button>}
    {events.length ? <Timeline items={events.map(event => ({ key: event.id, color: event.phase === 'blocked' ? 'orange' : 'blue', content: <div>
      <p data-collaboration-event={event.id} data-task-id={event.taskId} data-node-id={event.nodeId}><Tag>{phases[event.phase]}</Tag><strong>{event.summary}</strong></p>
      {event.blocker && <p>{t('cp.blocker', { text: event.blocker })}</p>}
      <p className="muted">Teams CLI · {event.role === 'owner' ? 'Owner' : t('cp.member')} · {new Date(event.at).toLocaleString('zh-CN')}</p>
      <Button type="link" size="small" onClick={() => showText(t('cp.receiptTitle', { id: event.operationId }), JSON.stringify(event, null, 2))}>{t('cp.viewReceipt')}</Button>
    </div> }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={nodeId ? t('cp.emptyNode') : t('cp.emptyTask')} />}
    <p className="muted">{t('cp.footer')}</p>
  </>;
  return embedded ? <div className="task-cli-progress" data-cli-task={taskId} data-cli-node={nodeId}>{content}</div> : <FrameworkCard title={t('cp.cardTitle')} action={<Tag>{t('cp.local')}</Tag>}>{content}</FrameworkCard>;
}
