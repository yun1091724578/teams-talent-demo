import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Select } from 'antd';
import { deliveryRequirementAction } from '../api.js';
import { taskAutomation } from '../task-automation.js';
import { deliveryRequirement } from '../delivery-requirements.js';
import { displayRequirementId } from '../display-text.js';
import { projectMembers } from '../teams-domain.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';

export function TaskAssignment({ secondary = false, projectId = 'carddemo', taskId = 'DEMO-MKT-001' }: { secondary?: boolean; projectId?: string; taskId?: string }) {
  const { state, role, busy, run, receiveState } = useDemo();
  const t = useT();
  const [open, setOpen] = useState(false), [assigneeId, setAssigneeId] = useState(''), [failed, setFailed] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setOpen(false); setFailed(false); }, [projectId, taskId, role]);
  const task = deliveryRequirement(state, projectId, taskId);
  const preparing = taskAutomation(state, {projectId, taskId})?.preparation;
  if (role !== 'owner' || !task || preparing && ['preparing-session', 'ready'].includes(preparing.status) || task.stage !== 'preparing' || task.preparedAt || Object.values(task.nodes).some(node => node.status !== 'pending')) return null;
  const assigned = !!task.assigneeId;
  const members = projectMembers(state, projectId).filter(member => member.status === 'active');
  return <><Button type={secondary ? 'link' : 'primary'} size={secondary ? 'small' : 'middle'} aria-label={t(assigned ? 'as.reassign' : 'as.assign')} onClick={() => { setAssigneeId(task.assigneeId); setFailed(false); setOpen(true); }}>{t(assigned ? 'as.reassign' : 'as.assign')}</Button>
    <Modal title={t(assigned ? 'as.reassignTitle' : 'as.assignTitle')} open={open} onCancel={() => setOpen(false)} closable={!busy} maskClosable={!busy} okText={t('as.confirm')} cancelText={t('common.cancel')} okButtonProps={{ 'aria-label': t('as.confirmAria'), disabled: busy || assigneeId === task.assigneeId }} cancelButtonProps={{ disabled: busy }} confirmLoading={busy} onOk={async () => {
      if (busy) return;
      setFailed(false);
      const saved = await run(() => deliveryRequirementAction(state, role, { action: 'assign', input: { projectId, taskId, assigneeId } }), t('as.updated'));
      if (saved) receiveState(saved);
      if (!active.current) return;
      if (saved) setOpen(false); else setFailed(true);
    }}>
      <p>{task.title} · {displayRequirementId(task.id)}</p><p className="muted">{assigned ? t('as.currentAssignee', { name: members.find(member => member.id === task.assigneeId)?.name ?? t('as.formerAssignee') }) : t('as.chooseHint')}</p>
      <label htmlFor="requirement-assignee">{t('as.assignee')}</label><Select id="requirement-assignee" aria-label={t('as.assigneeAria')} style={{ width: '100%', marginTop: 8 }} value={assigneeId} disabled={busy} options={[{ value: '', label: t('as.unassigned') }, ...members.map(member => ({ value: member.id, label: member.name }))]} onChange={setAssigneeId} />
      {failed && <Alert type="error" title={t('as.saveFailed')} />}
    </Modal>
  </>;
}
