import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Space, Spin } from 'antd';
import { deleteTaskRequirement, getTaskDeletionPlan } from '../api.js';
import { useDemo } from '../context.js';
import { displayRequirementId } from '../display-text.js';
import type { TaskDeletionPlan } from '../task-deletion.js';

interface Props { projectId: string; taskId: string; title: string; readonlyReason?: string; onDeleted(): void }
export function RequirementDelete(props: Props) {
  const { role } = useDemo();
  const [open, setOpen] = useState(false);
  if (role !== 'owner') return null;
  return <><Button danger onClick={() => setOpen(true)}>删除需求</Button>{open && <DeletionConfirmation key={props.projectId + ':' + props.taskId + ':' + role} {...props} onClose={() => setOpen(false)} />}</>;
}

function DeletionConfirmation({ projectId, taskId, title, readonlyReason, onDeleted, onClose }: Props & { onClose(): void }) {
  const { role, receiveState } = useDemo();
  const [plan, setPlan] = useState<TaskDeletionPlan>(), [loading, setLoading] = useState(!readonlyReason), [submitting, setSubmitting] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const mounted = useRef(true), inFlight = useRef(false), operationId = useRef(crypto.randomUUID());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (readonlyReason) return;
    let active = true; setLoading(true); setPlan(undefined); setError(''); operationId.current = crypto.randomUUID();
    void getTaskDeletionPlan(role, { projectId, taskId }).then(value => {
      if (!active) return;
      if (value.scope.projectId !== projectId || value.scope.taskId !== taskId) throw new Error('删除预检的任务范围不一致，请重新核对。');
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
  return <Modal title="删除需求" open onCancel={onClose} closable={!submitting} maskClosable={!submitting} keyboard={!submitting} destroyOnHidden footer={<Space><Button disabled={submitting} onClick={onClose}>取消</Button><Button danger type="primary" loading={submitting} disabled={loading || !!readonlyReason || !plan?.canDelete || !plan.planToken} onClick={() => void confirm()}>确认删除需求</Button></Space>}>
    <p><strong>{plan?.taskTitle ?? title}</strong></p>
    <Descriptions size="small" column={1} items={[{ key: 'task', label: '需求', children: displayRequirementId(taskId) }, { key: 'project', label: '项目', children: projectId === 'carddemo' ? 'Credit Card' : projectId === 'teams' ? 'iCode Teams' : projectId }]} />
    <p>将删除此需求及其交付过程、关联会话数据。其他需求保持不变。</p>
    <p>保留预置知识、公共 Skill、业务代码和项目文档；原生 iCode 全局历史与原始轨迹也会保留。</p>
    {loading && <Spin size="small" tip="正在核对删除范围"><div style={{ minHeight: 36 }} /></Spin>}
    {readonlyReason ? <Alert type="info" title="此需求不能删除" description={readonlyReason} /> : plan && !plan.canDelete ? <Alert type="warning" title="暂不能删除" description={plan.reason ?? '请先处理此需求的活动会话，再重新核对。'} /> : plan?.canDelete && <p className="muted">确认后会自动备份相关数据。此操作不会退出正在使用的 iCode 会话。</p>}
    {error && <Alert type="error" title="删除未完成" description={error} />}
    {!readonlyReason && (error || plan && !plan.canDelete) && <Button type="link" disabled={submitting || loading} onClick={() => setAttempt(value => value + 1)}>重新核对删除范围</Button>}
  </Modal>;
}
