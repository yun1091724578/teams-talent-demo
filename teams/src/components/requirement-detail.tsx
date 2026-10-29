import { Button, Descriptions, Space } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { displayRequirementId, displayText } from '../display-text.js';
import type { OverviewRequirement } from '../project-overview.js';
import { RequirementDelete } from './requirement-delete.js';
import { taskManagementRoute } from './project-task-shared.js';
import { deliveryRequirement, mainRequirementId } from '../delivery-requirements.js';
import { TaskAssignment } from './task-assignment.js';
import { taskExecutableBy, taskVisibleTo } from '../task-visibility.js';
// The phase enum stays Chinese because filters compare it; only its label is translated.
const phaseKeys: Record<string, MessageKey> = { '待开展': 'phase.pending', '准备': 'phase.preparing', '开发': 'phase.developing', '验证': 'phase.verifying', '待验收': 'phase.acceptance', '已交付': 'phase.delivered' };
export const requirementPhaseLabel = (phase: string) => { const key = phaseKeys[phase]; return key ? currentT(key) : phase; };
export function RequirementDetail({ projectId, item }: { projectId: string; item: OverviewRequirement }) {
  const { state, role, navigate, showText } = useDemo();
  const t = useT();
  if (!taskVisibleTo(role, item.assigneeId)) return null;
  const local = !!item.taskId && !!deliveryRequirement(state, projectId, item.taskId);
  const stateLabel = item.deliveryStatus ?? requirementPhaseLabel(item.phase);
  const nextLabel = role === 'owner' ? item.phase === '待验收' ? t('rd.acceptRequirement') : t('rd.viewDelivery') : taskExecutableBy(role, item.assigneeId) ? ['待开展','准备'].includes(item.phase) ? t('rd.startWork') : item.phase === '已交付' ? t('rd.viewDeliveryShort') : t('rd.continueWork') : t('rd.viewDeliveryShort');
  const route = item.route;
  return <div className="page-stack requirement-detail">
    <p className="muted">{t('ovm.sourceLabel', { source: item.source.origin==='teams-task'?'Teams':t('rd.requirementPlatform'), id: displayRequirementId(item.taskId ?? item.source.sourceRecordId) })}</p>
    <p>{displayText(item.source.summary)}</p>
    <Descriptions column={1} size="small" items={[
      { key: 'assignee', label: t('ovm.colAssignee'), children: <Space wrap>{item.owner}{local && !item.pendingConfirmation && <TaskAssignment key={projectId + ':' + item.taskId + ':' + role} projectId={projectId} taskId={item.taskId!} secondary />}</Space> },
      { key: 'state', label: t('rd.currentState'), children: stateLabel },
      { key: 'due', label: t('ovm.colDue'), children: item.due ?? t('ovm.unscheduled') },
    ]} />
    {!local && item.source.origin!=='teams-task' && <p className="muted">{projectId === 'teams' ? t('rd.readOnlySnapshot') : t('rd.notLocal')}</p>}
    <Space wrap>{local && item.pendingConfirmation && <TaskAssignment key={projectId + ':' + item.taskId + ':' + role} projectId={projectId} taskId={item.taskId!} />}{route && <Button type="primary" aria-label={nextLabel} onClick={() => navigate(route)}>{nextLabel}</Button>}<Button type="link" size="small" onClick={() => showText(t('ovm.sourceOriginal', { title: item.source.title }), displayText(item.source.detail))}>{t('ovm.viewSource')}</Button></Space>
    {local && !(projectId==='carddemo'&&item.taskId===mainRequirementId) && <div><RequirementDelete projectId={projectId} taskId={item.taskId!} title={item.source.title} onDeleted={()=>navigate(taskManagementRoute(projectId,'requirements'))} /></div>}
  </div>;
}
