import { useState } from 'react';
import { Button, Descriptions, Drawer, Space, Tag } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { DeliveryRequirement, RequirementNode } from '../delivery-requirements.js';
import { TaskSessions } from './task-sessions.js';
import { CollaborationProgress } from './collaboration-progress.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { taskVisibleTo } from '../task-visibility.js';

/** A read-only view of this delivery instance, with no historical-project trace fallback. */
export function TaskExecutionRecords({ task }: { task: DeliveryRequirement }) {
  const [open, setOpen] = useState(false);
  const { role } = useDemo();
  const t = useT();
  const labels: Record<RequirementNode, string> = { prepare: t('phase.preparing'), develop: t('phase.developing'), verify: t('phase.verifying'), accept: t('ter.accept') };
  const statuses = { pending: t('phase.pending'), running: t('gt.active'), blocked: t('ter.blocked'), complete: t('gt.completed'), 'waiting-owner': t('qr.awaitingOwner') };
  if (!taskVisibleTo(role, task.assigneeId)) return null;
  const scope = { projectId: task.projectId, taskId: task.id };
  return <>
    <Button type="text" icon={<FileTextOutlined />} aria-label={t('pj.viewExecutionAria')} title={t('pj.viewExecutionAria')} onClick={() => setOpen(true)}><span className="project-secondary-action-label">{t('pj.executionRecords')}</span></Button>
    <Drawer title={t('ter.drawerTitle', { id: task.id })} width={760} open={open} onClose={() => setOpen(false)} destroyOnHidden>
      <div className="page-stack" data-execution-task={task.id} data-execution-project={task.projectId}>
        <h3>{task.title}</h3>
        <Descriptions size="small" column={1} items={(Object.keys(labels) as RequirementNode[]).map(node => ({ key: node, label: labels[node], children: <div style={{ minWidth: 0 }}><Space wrap><Tag>{statuses[task.nodes[node].status]}</Tag>{task.nodes[node].updatedAt && <span className="muted">{new Date(task.nodes[node].updatedAt).toLocaleString('zh-CN')}</span>}</Space><p>{task.nodes[node].summary || t('ter.noNodeRecord')}</p></div> }))} />
        <TaskSessions scope={scope} readonly />
        <CollaborationProgress {...scope} />
      </div>
    </Drawer>
  </>;
}
