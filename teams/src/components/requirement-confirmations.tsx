import { useState } from 'react';
import { Alert, Button, Checkbox, Input, List, Modal, Space, Tag } from 'antd';
import { deliveryRequirementAction } from '../api.js';
import { useDemo } from '../context.js';
import type { DeliveryRequirement, RequirementConfirmation } from '../delivery-requirements.js';

type Draft = Pick<RequirementConfirmation, 'item' | 'basis' | 'confirmedBy'> & { id?: string };
const blank = (): Draft => ({ item: '', basis: '', confirmedBy: '' });
const stamp = (at: string) => new Date(at).toLocaleString('zh-CN');

/** Task-level confirmations stay editable only before the result is submitted for acceptance. */
export function RequirementConfirmations({ task }: { task: DeliveryRequirement }) {
  const { state, role, run, receiveState, busy } = useDemo();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<Draft[]>([blank()]), [attested, setAttested] = useState(false), [failed, setFailed] = useState(false);
  const items = task.confirmations ?? [];
  const editable = role === 'owner' && task.stage !== 'awaiting-acceptance' && task.stage !== 'accepted';
  const start = () => {
    setDraft(items.length ? items.map(({ id, item, basis, confirmedBy }) => ({ id, item, basis, confirmedBy })) : [blank()]);
    setAttested(false); setFailed(false); setOpen(true);
  };
  const change = (index: number, field: keyof Draft, value: string) => setDraft(current => current.map((row, position) => position === index ? { ...row, [field]: value } : row));
  const filled = draft.filter(row => row.item.trim() || row.basis.trim() || row.confirmedBy.trim());
  const valid = filled.length === 0 || filled.every(row => row.item.trim() && row.basis.trim() && row.confirmedBy.trim()) && attested;
  const save = async () => {
    if (!valid || busy) return;
    setFailed(false);
    const saved = await run(() => deliveryRequirementAction(state, role, {
      projectId: task.projectId, taskId: task.id, action: 'confirm',
      confirmations: filled.map(({ id, item, basis, confirmedBy }) => ({ ...(id ? { id } : {}), item: item.trim(), basis: basis.trim(), confirmedBy: confirmedBy.trim() })),
    }), '确认依据已保存');
    if (!saved) { setFailed(true); return; }
    receiveState(saved); setOpen(false);
  };
  return <section className="task-confirmations" data-confirmation-count={items.length}>
    <div className="task-confirmations-heading">
      <div><h3>已确认事项与依据</h3><p className="muted">由 Owner 登记；未登记的事项不按已确认处理。</p></div>
      {editable && <Button size="small" onClick={start}>{items.length ? '修改确认依据' : '登记确认依据'}</Button>}
    </div>
    {items.length ? <List size="small" dataSource={items} renderItem={item => <List.Item data-confirmation-id={item.id}><div>
      <Space wrap><Tag color="green">已确认</Tag><strong>{item.item}</strong><span className="muted">确认人：{item.confirmedBy} · 登记时间 {stamp(item.confirmedAt)}</span></Space>
      <p className="task-node-fulltext">{item.basis}</p>
    </div></List.Item>} /> : <p className="muted">尚未登记确认依据；影响开发的待确认事项须由 Owner 逐项登记确认结论与依据。</p>}
    <Modal title="登记确认依据" open={open} width={720} okText="保存确认依据" cancelText="取消" confirmLoading={busy}
      onCancel={() => setOpen(false)} onOk={() => void save()}
      okButtonProps={{ 'aria-label': '保存确认依据', disabled: busy || !valid }} cancelButtonProps={{ disabled: busy }}
      closable={!busy} maskClosable={!busy} destroyOnHidden>
      {failed && <Alert type="error" title="确认依据未保存，请核对错误提示后重试。填写内容已保留。" />}
      <p className="muted">仅登记已由确认人明确同意的事项；未确认事项继续留在 PRD 待确认项，不要在此登记。</p>
      {items.length > 0 && <Button type="link" danger size="small" onClick={() => { setDraft([blank()]); setAttested(false); }}>清空全部</Button>}
      <div className="page-stack">{draft.map((row, index) => <div className="page-stack" key={index} data-confirmation-draft={index}>
        <Input aria-label={'确认事项 ' + (index + 1)} value={row.item} maxLength={300} placeholder="关键事项（如：活动期间）" onChange={event => change(index, 'item', event.target.value)} />
        <Input.TextArea aria-label={'确认依据 ' + (index + 1)} value={row.basis} maxLength={2000} rows={2} placeholder="确认依据（决定、邮件、会议纪要或制度条款）" onChange={event => change(index, 'basis', event.target.value)} />
        <Space><Input aria-label={'确认人 ' + (index + 1)} value={row.confirmedBy} maxLength={80} placeholder="确认人（如：林悦）" onChange={event => change(index, 'confirmedBy', event.target.value)} /><Button type="link" danger size="small" onClick={() => setDraft(current => current.length === 1 ? [blank()] : current.filter((_, position) => position !== index))}>删除</Button></Space>
      </div>)}</div>
      <Button size="small" onClick={() => setDraft(current => [...current, blank()])} disabled={draft.length >= 20}>添加事项</Button>
      {filled.length === 0 && <p className="muted">保存后将清除全部确认依据。</p>}
      <div><Checkbox checked={attested} onChange={event => setAttested(event.target.checked)}>确认人已明确同意以上事项与依据</Checkbox></div>
    </Modal>
  </section>;
}
