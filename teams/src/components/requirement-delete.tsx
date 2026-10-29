import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Space, Spin } from 'antd';
import { deleteTaskRequirement, getTaskDeletionPlan } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { displayRequirementId } from '../display-text.js';
import type { TaskDeletionPlan } from '../task-deletion.js';

interface Props { projectId: string; taskId: string; title: string; readonlyReason?: string; onDeleted(): void }
export function RequirementDelete(props: Props) {
  const { role } = useDemo();
  const t = useT();
  const [open, setOpen] = useState(false);
  if (role !== 'owner') return null;
  return <><Button danger onClick={() => setOpen(true)}>{t('del.deleteRequirement')}</Button>{open && <DeletionConfirmation key={props.projectId + ':' + props.taskId + ':' + role} {...props} onClose={() => setOpen(false)} />}</>;
}

function DeletionConfirmation({ projectId, taskId, title, readonlyReason, onDeleted, onClose }: Props & { onClose(): void }) {
  const { role, receiveState } = useDemo();
  const t = useT();
  const [plan, setPlan] = useState<TaskDeletionPlan>(), [loading, setLoading] = useState(!readonlyReason), [submitting, setSubmitting] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const mounted = useRef(true), inFlight = useRef(false), operationId = useRef(crypto.randomUUID());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (readonlyReason) return;
    let active = true; setLoading(true); setPlan(undefined); setError(''); operationId.current = crypto.randomUUID();
    void getTaskDeletionPlan(role, { projectId, taskId }).then(value => {
      if (!active) return;
      if (value.scope.projectId !== projectId || value.scope.taskId !== taskId) throw new Error(t('del.scopeMismatch'));
      setPlan(value);
    }).catch(cause => { if (active) setError((cause as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, taskId, role, attempt, readonlyReason]);
  const confirm = async () => {
    if (inFlight.current || loading || !plan?.canDelete || !plan.planToken || readonlyReason) return;
    inFlight.current = true; setSubmitting(true); setError('');
    try {
      const result = await deleteTaskRequirement(role, { projectId, taskId, planToken: plan.planToken, revision: plan.revision, operationId: operationId.current });
      receiveState(result.state);
      if (mounted.current) { onClose(); onDeleted(); }
    } catch (cause) { if (mounted.current) setError((cause as Error).message); }
    finally { inFlight.current = false; if (mounted.current) setSubmitting(false); }
  };
  return <Modal title={t('del.title')} open onCancel={onClose} closable={!submitting} maskClosable={!submitting} keyboard={!submitting} destroyOnHidden footer={<Space><Button disabled={submitting} onClick={onClose}>{t('del.cancel')}</Button><Button danger type="primary" loading={submitting} disabled={loading || !!readonlyReason || !plan?.canDelete || !plan.planToken} onClick={() => void confirm()}>{t('del.confirm')}</Button></Space>}>
    <p><strong>{plan?.taskTitle ?? title}</strong></p>
    <Descriptions size="small" column={1} items={[{ key: 'task', label: t('del.requirement'), children: displayRequirementId(taskId) }, { key: 'project', label: t('del.project'), children: projectId === 'carddemo' ? 'Credit Card' : projectId === 'teams' ? 'iCode Teams' : projectId }]} />
    <p>{t('del.body')}</p>
    <p>{t('del.keep')}</p>
    {loading && <Spin size="small" tip={t('del.checking')}><div style={{ minHeight: 36 }} /></Spin>}
    {readonlyReason ? <Alert type="info" title={t('del.readonlyTitle')} description={readonlyReason} /> : plan && !plan.canDelete ? <Alert type="warning" title={t('del.blockedTitle')} description={plan.reason ?? t('del.blockedFallback')} /> : plan?.canDelete && <p className="muted">{t('del.backupNote')}</p>}
    {error && <Alert type="error" title={t('del.failedTitle')} description={error} />}
    {!readonlyReason && (error || plan && !plan.canDelete) && <Button type="link" disabled={submitting || loading} onClick={() => setAttempt(value => value + 1)}>{t('del.recheck')}</Button>}
  </Modal>;
}
