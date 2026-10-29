import { projectMembers } from '../teams-domain.js';
import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import type { OverviewRequirement } from '../project-overview.js';
import { taskManagementRoute } from './project-task-shared.js';
import { taskExecutableBy, visibleGenericTasks } from '../task-visibility.js';

const statusKeys = { pending: 'gt.pending', active: 'gt.active', completed: 'gt.completed' } as const;

export function GeneralTasks({ projectId, research }: { projectId: string; research: OverviewRequirement[] }) {
  const { state, role, busy, update, navigate } = useDemo();
  const t = useT();
  const [creating, setCreating] = useState(false), [draftId, setDraftId] = useState(''), [failed, setFailed] = useState(false), [result, setResult] = useState('');
  const [form] = Form.useForm();
  const tasks = visibleGenericTasks(state, projectId, role);
  const itemId = new URLSearchParams(location.hash.split('?')[1] ?? '').get('item');
  const selected = tasks.find(task => task.id === itemId);
  useEffect(() => setResult(''), [itemId, role]);
  useEffect(() => setCreating(false), [projectId, role]);
  const teamMembers = projectId === 'teams' ? [] : projectMembers(state, projectId);
  const members = teamMembers.filter(member => member.status === 'active');
  const memberName = (id: string | null) => teamMembers.find(member => member.id === id)?.name ?? t('ov.unassigned');
  const show = (id?: string) => navigate(taskManagementRoute(projectId, 'general', id ? { item: id } : {}));
  const rows = [...tasks.map(task => ({ id: task.id, title: task.title, owner: memberName(task.assigneeId), status: t(statusKeys[task.status]), due: task.due, description: task.description, route: undefined as string | undefined, original: false })), ...research.map(task => ({ id: task.id, title: task.source.title, owner: task.owner, status: task.phase, due: task.due, description: task.source.summary, route: task.route, original: true }))];
  return <div className="page-stack">
    <div className="overview-header"><p className="muted">{t('gtm.intro')}</p>{role === 'owner' && projectId !== 'teams' && <Button type="primary" aria-label={t('gtm.newTask')} onClick={() => { setDraftId('GT-' + crypto.randomUUID()); form.resetFields(); setFailed(false); setCreating(true); }}>{t('gtm.newTask')}</Button>}</div>
    <Table className="general-task-table" size="small" rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('gtm.empty')} /> }} columns={[
      { title: t('gtm.colTask'), width: 300, render: (_, item) => <><Button type="link" className="overview-title" onClick={() => show(item.id)}>{item.title}</Button><p className="muted">{item.description}</p></> },
      { title: t('gtm.colOwner'), dataIndex: 'owner', width: 100 }, { title: t('gtm.colStatus'), render: (_, item) => <Tag>{item.status}</Tag>, width: 110 }, { title: t('gtm.colDue'), render: (_, item) => item.due ?? t('gtm.unscheduled'), width: 120 },

    ]} />
    {projectId === 'teams' && <p className="muted">{t('gtm.teamsNote')}</p>}
    <Modal title={t('gtm.newTask')} open={creating && role === 'owner'} onCancel={() => setCreating(false)} okText={t('gtm.createTask')} cancelText={t('common.cancel')} confirmLoading={busy} okButtonProps={{ 'aria-label': t('gtm.createAria'), disabled: busy }} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} onOk={() => form.submit()}>
      {failed && <Alert type="error" title={t('gtm.saveFailed')} />}
      <Form form={form} layout="vertical" disabled={busy} initialValues={{ title: '', description: '', assigneeId: members.some(member => member.id === 'member') ? 'member' : '', due: '' }} onFinish={async values => { setFailed(false); const saved = await update('task.create', { projectId, id: draftId, ...values }); if (!saved) { setFailed(true); return; } setCreating(false); show(draftId); }}>
        <Form.Item name="title" label={t('gtm.taskName')} rules={[{ required: true, whitespace: true }]}><Input aria-label={t('gtm.taskNameAria')} maxLength={120} /></Form.Item>
        <Form.Item name="description" label={t('gtm.workNote')}><Input.TextArea aria-label={t('gtm.workNoteAria')} rows={3} maxLength={3000} /></Form.Item>
        <Form.Item name="assigneeId" label={t('gtm.colOwner')}><Select aria-label={t('gtm.assigneeAria')} options={[{ value: '', label: t('gtm.unassignedOption') }, ...members.map(member => ({ value: member.id, label: member.name }))]} /></Form.Item>
        <Form.Item name="due" label={t('gtm.colDue')}><Input type="date" aria-label={t('gtm.dueAria')} /></Form.Item>
      </Form>
    </Modal>
    <Drawer title={selected?.title ?? t('gtm.generalTask')} open={!!selected} width={640} onClose={() => show()} destroyOnHidden>{selected && <div className="page-stack">
      <Descriptions column={1} items={[{ key: 'id', label: t('gtm.taskId'), children: selected.id }, { key: 'status', label: t('gtm.colStatus'), children: t(statusKeys[selected.status]) }, { key: 'owner', label: t('gtm.colOwner'), children: memberName(selected.assigneeId) }, { key: 'due', label: t('gtm.colDue'), children: selected.due ?? t('gtm.unscheduled') }]} />
      <p>{selected.description || t('gtm.noDescription')}</p>
      {role === 'owner' && selected.status === 'pending' && <><label>{t('gtm.assignOwner')}</label><Select aria-label={t('gtm.assignAria')} value={selected.assigneeId ?? ''} disabled={busy} options={[{ value: '', label: t('gtm.unassignedOption') }, ...members.map(member => ({ value: member.id, label: member.name }))]} onChange={assigneeId => void update('task.assign', { projectId, id: selected.id, assigneeId })} /></>}
      {taskExecutableBy(role, selected.assigneeId) && selected.status === 'pending' && <Button type="primary" loading={busy} disabled={busy} onClick={() => void update('task.start', { projectId, id: selected.id })}>{t('gtm.startTask')}</Button>}
      {taskExecutableBy(role, selected.assigneeId) && selected.status === 'active' && <><Input.TextArea aria-label={t('gtm.completeAria')} value={result} onChange={event => setResult(event.target.value)} rows={4} maxLength={3000} placeholder={t('gtm.completePlaceholder')} /><Button type="primary" loading={busy} disabled={busy || !result.trim()} onClick={() => void update('task.complete', { projectId, id: selected.id, result })}>{t('gtm.submitComplete')}</Button></>}
      {selected.status === 'completed' && <><strong>{t('gtm.completionNote')}</strong><p>{selected.result}</p></>}
      <p className="muted">{t('gtm.footer')}</p>
    </div>}</Drawer>
  </div>;
}
