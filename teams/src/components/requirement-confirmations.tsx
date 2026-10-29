import { useState } from 'react';
import { Alert, Button, Checkbox, Input, List, Modal, Space, Tag } from 'antd';
import { deliveryRequirementAction } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import type { DeliveryRequirement, RequirementConfirmation } from '../delivery-requirements.js';

type Draft = Pick<RequirementConfirmation, 'item' | 'basis' | 'confirmedBy'> & { id?: string };
const blank = (): Draft => ({ item: '', basis: '', confirmedBy: '' });
const stamp = (at: string) => new Date(at).toLocaleString('zh-CN');

/** Task-level confirmations stay editable only before the result is submitted for acceptance. */
export function RequirementConfirmations({ task }: { task: DeliveryRequirement }) {
  const { state, role, run, receiveState, busy } = useDemo();
  const t = useT();
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
    }), t('rc.saved'));
    if (!saved) { setFailed(true); return; }
    receiveState(saved); setOpen(false);
  };
  return <section className="task-confirmations" data-confirmation-count={items.length}>
    <div className="task-confirmations-heading">
      <div><h3>{t('rc.title')}</h3><p className="muted">{t('rc.note')}</p></div>
      {editable && <Button size="small" onClick={start}>{items.length ? t('rc.edit') : t('rc.register')}</Button>}
    </div>
    {items.length ? <List size="small" dataSource={items} renderItem={item => <List.Item data-confirmation-id={item.id}><div>
      <Space wrap><Tag color="green">{t('rc.confirmed')}</Tag><strong>{item.item}</strong><span className="muted">{t('rc.confirmerAt', { name: item.confirmedBy, time: stamp(item.confirmedAt) })}</span></Space>
      <p className="task-node-fulltext">{item.basis}</p>
    </div></List.Item>} /> : <p className="muted">{t('rc.empty')}</p>}
    <Modal title={t('rc.register')} open={open} width={720} okText={t('rc.saveOk')} cancelText={t('common.cancel')} confirmLoading={busy}
      onCancel={() => setOpen(false)} onOk={() => void save()}
      okButtonProps={{ 'aria-label': t('rc.saveOk'), disabled: busy || !valid }} cancelButtonProps={{ disabled: busy }}
      closable={!busy} maskClosable={!busy} destroyOnHidden>
      {failed && <Alert type="error" title={t('rc.saveFailed')} />}
      <p className="muted">{t('rc.onlyAgreed')}</p>
      {items.length > 0 && <Button type="link" danger size="small" onClick={() => { setDraft([blank()]); setAttested(false); }}>{t('rc.clearAll')}</Button>}
      <div className="page-stack">{draft.map((row, index) => <div className="page-stack" key={index} data-confirmation-draft={index}>
        <Input aria-label={t('rc.itemAria', { index: index + 1 })} value={row.item} maxLength={300} placeholder={t('rc.itemPlaceholder')} onChange={event => change(index, 'item', event.target.value)} />
        <Input.TextArea aria-label={t('rc.basisAria', { index: index + 1 })} value={row.basis} maxLength={2000} rows={2} placeholder={t('rc.basisPlaceholder')} onChange={event => change(index, 'basis', event.target.value)} />
        <Space><Input aria-label={t('rc.byAria', { index: index + 1 })} value={row.confirmedBy} maxLength={80} placeholder={t('rc.byPlaceholder')} onChange={event => change(index, 'confirmedBy', event.target.value)} /><Button type="link" danger size="small" onClick={() => setDraft(current => current.length === 1 ? [blank()] : current.filter((_, position) => position !== index))}>{t('rc.remove')}</Button></Space>
      </div>)}</div>
      <Button size="small" onClick={() => setDraft(current => [...current, blank()])} disabled={draft.length >= 20}>{t('rc.add')}</Button>
      {filled.length === 0 && <p className="muted">{t('rc.clearNote')}</p>}
      <div><Checkbox checked={attested} onChange={event => setAttested(event.target.checked)}>{t('rc.attest')}</Checkbox></div>
    </Modal>
  </section>;
}
