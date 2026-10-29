import { projectTasksVisibleTo } from '../task-visibility.js';
import { defaultTeamId, findTeam, projectTeam } from '../teams-domain.js';
import { ProjectTaskManagement } from '../components/project-task-management.js';
import { useState } from 'react';
import { Alert, Button, Descriptions, Empty, Form, Input, Modal, Space, Tag } from 'antd';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { createdProjectRoute, type CreatedProject, type CreatedProjectFields } from '../created-projects.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { ProjectToolbar, projectPages } from '../components/project-toolbar.js';
import { ProjectContentTemplate } from '../components/project-content-template.js';
import { ProjectAssets } from '../components/project-assets.js';
import { ProjectKnowledge } from '../components/project-knowledge.js';
import { ProjectWorkLaunch } from '../components/project-work-launch.js';
import { Mono, Origin } from '../components/common.js';
import { preferredDeliveryTask, projectDeliveryTasks } from '../project-delivery-tasks.js';
import type { RequirementNode } from '../delivery-requirements.js';
import { DeliveryTaskSidebar } from '../components/delivery-task-sidebar.js';
import { visibleGenericTasks } from '../task-visibility.js';
import { LiveTaskDelivery } from '../components/live-task-delivery.js';
import { TaskExecutionRecords } from '../components/task-execution-records.js';

const emptyKeys = { delivery: { title: 'cp.empty.deliveryTitle', note: 'cp.empty.deliveryNote' } } as const;

/** Fields follow RealProjectIndex in Teams project-real.tsx; project creation carries an explicit team scope. */
function ProjectFields({ teamName }: { teamName: string }) {
  const t = useT();
  return <>
    <Form.Item label={t('cp.field.team')}><Input value={teamName} disabled /></Form.Item>
    <Form.Item name="name" label={t('cp.field.name')} rules={[{ required: true, whitespace: true, message: t('cp.field.nameRequired') }]}><Input aria-label={t('cp.field.name')} maxLength={80} /></Form.Item>
    <Form.Item name="description" label={t('cp.field.description')}><Input.TextArea aria-label={t('cp.field.description')} rows={3} maxLength={1500} /></Form.Item>
    <Form.Item name="remoteUrl" label={t('cp.field.remoteUrl')} rules={[{ required: true, whitespace: true, message: t('cp.field.remoteUrlRequired') }]}><Input aria-label={t('cp.field.remoteUrl')} maxLength={500} placeholder={t('cp.field.remoteUrlPlaceholder')} /></Form.Item>
    <Form.Item name="repositoryIdentity" label={t('cp.field.repositoryIdentity')} rules={[{ required: true, whitespace: true, message: t('cp.field.repositoryIdentityRequired') }]}><Input aria-label={t('cp.field.repositoryIdentity')} maxLength={200} placeholder={t('cp.field.repositoryIdentityPlaceholder')} /></Form.Item>
  </>;
}

export function CreateProjectButton({ teamId = defaultTeamId }: { teamId?: string }) {
  const { state, role, busy, update, navigate } = useDemo();
  const t = useT();
  const [open, setOpen] = useState(false), [draftId, setDraftId] = useState(''), [failed, setFailed] = useState(false);
  const [form] = Form.useForm<CreatedProjectFields>();
  if (role !== 'owner') return null;
  return <>
    <Button type="primary" icon={<PlusOutlined />} aria-label={t('cp.addProject')} onClick={() => { form.resetFields(); setFailed(false); setDraftId(crypto.randomUUID()); setOpen(true); }}>{t('cp.addProject')}</Button>
    <Modal title={t('cp.addProject')} open={open} width={620} okText={t('cp.create')} cancelText={t('common.cancel')} confirmLoading={busy} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} onCancel={() => setOpen(false)} onOk={() => form.submit()}>
      <p className="muted">{t('cp.createNote')}</p>
      {failed && <Alert type="error" title={t('cp.createFailed')} />}
      <Form form={form} layout="vertical" initialValues={{ description: '' }} disabled={busy} onFinish={async values => {
        setFailed(false);
        const saved = await update('project.create', { id: draftId, teamId, ...values });
        if (!saved) { setFailed(true); return; }
        setOpen(false); form.resetFields(); navigate(createdProjectRoute(draftId));
      }}><ProjectFields teamName={findTeam(state, teamId).name} /></Form>
      <p className="muted">{t('cp.createFooter')}</p>
    </Modal>
  </>;
}

export function CreatedProjectCard({ project }: { project: CreatedProject }) {
  const { state, role, navigate } = useDemo();
  const t = useT();
  return <FrameworkCard title={project.name} action={<Tag>{t('cp.newProject')}</Tag>}>
    <p>{project.description || t('cp.noDescription')}</p>
    <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[{ key: 'team', label: t('cp.field.team'), children: projectTeam(state, project.id).name }, { key: 'owner', label: t('cp.ownerLabel'), children: state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '' }, { key: 'repository', label: t('cp.repoLabel'), children: project.repositoryIdentity }, { key: 'scope', label: t('cp.scopeLabel'), children: t('cp.genericTasks', { count: visibleGenericTasks(state, project.id, role).length }) }]} />
    <Space wrap><Button type="primary" data-project-primary={project.id} aria-label={t(role === 'owner' ? 'cp.enterManagementAria' : 'cp.enterDeliveryAria', { name: project.name })} onClick={() => navigate(createdProjectRoute(project.id, role === 'owner' ? 'management' : 'delivery'))}>{role === 'owner' ? t('cp.enterManagement') : t('cp.enterDelivery')}</Button><Button onClick={() => navigate(createdProjectRoute(project.id))}>{t('cp.materials')}</Button>{role === 'owner' && <Button aria-label={t('cp.editProjectAria', { name: project.name })} onClick={() => navigate(createdProjectRoute(project.id, 'settings'))}>{t('cp.editProject')}</Button>}</Space>
  </FrameworkCard>;
}

export function CreatedProjectPage({ project, tab }: { project: CreatedProject; tab: string }) {
  const { state, role, busy, update, navigate } = useDemo();
  const t = useT();
  const [failed, setFailed] = useState(false);
  if (!projectTasksVisibleTo(state, project.id, role)) return <Alert type="info" title={t('cp.outOfScope')} description={t('cp.outOfScopeDesc')} />;
  const tasks = projectDeliveryTasks(state, project.id, role);
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const requestedTask = params.get('task');
  const selected = requestedTask ? tasks.find(task => task.id === requestedTask) : preferredDeliveryTask(tasks, role);
  const requestedNode = params.get('node');
  const node: RequirementNode = requestedNode && ['prepare', 'develop', 'verify', 'accept'].includes(requestedNode) ? requestedNode as RequirementNode : selected?.node ?? 'prepare';
  const jump = (next: string) => navigate(createdProjectRoute(project.id, next) + (next === 'delivery' && selected ? '&task=' + encodeURIComponent(selected.id) : ''));
  if (![...projectPages.map(page => page.key), 'settings'].includes(tab)) return <Alert type="error" title={t('cp.pageMissing')} action={<Button onClick={() => jump('content')}>{t('cp.goOverview')}</Button>} />;
  return <div className="page-stack project-workspace project-detail created-project">
    <ProjectToolbar activeKey={tab} onChange={jump} actions={<>{selected?.record && <TaskExecutionRecords key={project.id + ':' + selected.id + ':' + role} task={selected.record} />}{role === 'owner' ? <Button type="text" icon={<SettingOutlined />} aria-label={t('cp.projectSettings')} onClick={() => jump('settings')}><span className="project-secondary-action-label">{t('cp.projectSettings')}</span></Button> : <Tag>{t('cp.projectMember')}</Tag>}{(tab !== 'delivery' || selected) && <ProjectWorkLaunch target={{ projectId: project.id, tab, ...(tab === 'delivery' && selected ? { taskId: selected.id, nodeId: node } : {}) }} />}</>} />
    {tab === 'content' ? <ProjectContentTemplate projectId={project.id} name={project.name} description={project.description} origin={<Origin kind="simulated" />}
      information={[{ key: 'team', label: t('cp.field.team'), children: projectTeam(state, project.id).name }, { key: 'owner', label: t('cp.ownerLabel'), children: state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '' }, { key: 'repository', label: t('cp.repoLabel'), span: 2, children: <><strong>{project.repositoryIdentity}</strong><p><Mono>{project.remoteUrl}</Mono></p></> }, { key: 'id', label: t('cp.projectId'), span: 2, children: <Mono>{project.id}</Mono> }, { key: 'directory', label: t('cp.localDirectory'), span: 2, children: t('cp.noLocalDirectory') }]}
      members={<><p>{t('cp.membersNote', { name: state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '' })}</p><Button onClick={() => navigate('team?team=' + projectTeam(state, project.id).id)}>{t('cp.viewTeamMembers')}</Button></>}
      assets={<ProjectAssets projectId={project.id} />}
      knowledge={<ProjectKnowledge projectId={project.id} />}
      requirements={<>{tasks.length ? <p>{t('cp.requirementsCount', { count: tasks.length })}</p> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cp.noRequirements')} />}<p className="muted">{t('cp.requirementsNote')}</p><Button onClick={() => jump('management')}>{t('cp.viewManagement')}</Button></>}
      skills={[]}
    /> : tab === 'management' ? <ProjectTaskManagement projectId={project.id} /> : tab === 'settings' ? <>
      <Button className="self-start" onClick={() => jump('content')}>{t('cp.backToOverview')}</Button>
      <FrameworkCard title={t('cp.basicInfo')}>
        {role !== 'owner' && <p className="muted">{t('cp.basicInfoNote')}</p>}
        {failed && <Alert type="error" title={t('cp.saveFailed')} />}
        <Form key={project.id + project.updatedAt} layout="vertical" initialValues={project} disabled={role !== 'owner' || busy} onFinish={async values => { setFailed(false); if (!await update('project.metadata.update', { id: project.id, ...values })) setFailed(true); }}>
          <ProjectFields teamName={projectTeam(state, project.id).name} />
          {role === 'owner' && <Button type="primary" htmlType="submit" loading={busy}>{t('cp.saveProject')}</Button>}
        </Form>
      </FrameworkCard>
    </> : selected?.record ? <LiveTaskDelivery key={project.id + ':' + selected.id + ':' + role} task={selected.record} node={node} /> : <div className="project-delivery-layout without-background"><DeliveryTaskSidebar projectId={project.id} selectedTaskId="" /><div className="project-node-main">{requestedTask ? <Alert type="info" title={t('cp.taskMissing')} action={<Button onClick={() => navigate(createdProjectRoute(project.id, 'delivery'))}>{t('cp.viewProjectTasks')}</Button>} /> : <FrameworkCard title={t(emptyKeys[tab as keyof typeof emptyKeys].title)}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={role === 'member' ? t('cp.noDeliveryTasks') : t(emptyKeys[tab as keyof typeof emptyKeys].note)} /><p className="muted">{t('cp.noRecords', { name: project.name })}</p><Button onClick={() => jump('content')}>{t('cp.viewOverview')}</Button></FrameworkCard>}</div></div>}
  </div>;
}
