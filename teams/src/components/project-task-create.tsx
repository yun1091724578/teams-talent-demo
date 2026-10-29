import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { deliveryRequirementAction } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { projectMembers } from '../teams-domain.js';

/** Creation is explicit; a failed save keeps both the draft and its request identity. */
export function ProjectTaskCreate({ projectId, kind, onCreated }: { projectId: string; kind: 'requirement' | 'issue'; onCreated(): void }) {
  const { state, role, busy, run, update, receiveState } = useDemo();
  const t = useT();
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false), [draftId, setDraftId] = useState('');
  const [form] = Form.useForm();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const requirement = kind === 'requirement', label = requirement ? t('ptc.requirement') : t('ptc.issue');
  const members = projectMembers(state, projectId).filter(member => member.status === 'active');
  if (role !== 'owner') return null;
  return <>
    <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDraftId((requirement ? 'REQ-' : 'ISSUE-') + crypto.randomUUID()); setFailed(false); setOpen(true); }}>{requirement ? t('ptc.newRequirement') : t('ptc.newIssue')}</Button>
    <Modal title={requirement ? t('ptc.newRequirement') : t('ptc.newIssue')} open={open} okText={requirement ? t('ptc.createRequirement') : t('ptc.createIssue')} cancelText={t('common.cancel')} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={busy} okButtonProps={{ disabled: busy }} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} destroyOnHidden>
      {failed && <Alert type="error" title={t('ptc.notSaved', { kind: label })} />}
      <Form form={form} layout="vertical" disabled={busy} initialValues={{ title: '', description: '', assigneeId: '', due: '', severity: 'medium' }} onFinish={async values => {
        setFailed(false);
        const payload = { projectId, id: draftId, title: values.title.trim(), description: values.description.trim(), assigneeId: values.assigneeId ?? '' };
        const saved = requirement
          ? await run(() => deliveryRequirementAction(state, role, { action: 'create', input: { ...payload, ...(values.due ? { due: values.due } : {}) } }), t('ptc.created'))
          : await update('issue.create', { ...payload, severity: values.severity });
        if (saved && requirement) receiveState(saved);
        if (!active.current) return;
        if (!saved) { setFailed(true); return; }
        setOpen(false); onCreated();
      }}>
        <Form.Item name="title" label={t('ptc.titleLabel', { kind: label })} rules={[{ required: true, whitespace: true, message: t('ptc.titleRequired', { kind: label }) }]}><Input aria-label={t('ptc.titleLabel', { kind: label })} maxLength={160} /></Form.Item>
        <Form.Item name="description" label={t('ptc.descriptionLabel', { kind: label })} rules={[{ required: true, whitespace: true, message: t('ptc.descriptionRequired', { kind: label }) }]}><Input.TextArea aria-label={t('ptc.descriptionLabel', { kind: label })} rows={4} maxLength={4000} showCount /></Form.Item>
        {!requirement && <Form.Item name="severity" label={t('ptc.severity')} rules={[{ required: true }]}><Select aria-label={t('ptc.severityAria')} options={[{ value: 'critical', label: t('ptc.critical') }, { value: 'high', label: t('ptc.high') }, { value: 'medium', label: t('ptc.medium') }, { value: 'low', label: t('ptc.low') }]} /></Form.Item>}
        <Form.Item name="assigneeId" label={requirement ? t('ovm.colAssignee') : t('ovm.colOwner')}><Select aria-label={requirement ? t('ovm.colAssignee') : t('ovm.colOwner')} options={[{ value: '', label: t('gtm.unassignedOption') }, ...members.map(member => ({ value: member.id, label: member.name }))]} /></Form.Item>
        {requirement && <Form.Item name="due" label={t('ovm.colDue')}><Input type="date" aria-label={t('ptc.dueAria')} /></Form.Item>}
      </Form>
    </Modal>
  </>;
}
