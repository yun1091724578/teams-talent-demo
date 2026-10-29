import { projectMembers, projectTeam } from '../teams-domain.js';
import { ProjectTaskManagement } from '../components/project-task-management.js';
import { displayProjectDescription } from '../display-text.js';
import { useEffect, useState } from 'react';
import { getTalentsKnowledge, type TalentsSkillVersion } from '../api.js';
import { Button, Descriptions, Form, Input, Modal, Space, Tabs, Tag } from 'antd';
import { FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { ActionButton, Mono, Origin } from '../components/common.js';
import { stageKeys } from '../domain.js';
import { ProjectContentTemplate } from '../components/project-content-template.js';
import { ProjectAssets } from '../components/project-assets.js';
import { ProjectKnowledge } from '../components/project-knowledge.js';

export function ProjectContent() {
  const { state, data, role, navigate } = useDemo();
  const t = useT();
  // Project skills Talents wrote a new version of (applying a trajectory diagnosis suggestion) show that version.
  const [talentsSkills, setTalentsSkills] = useState<TalentsSkillVersion[]>([]);
  useEffect(() => { let live = true; getTalentsKnowledge('carddemo').then(value => { if (live) setTalentsSkills(value.skills ?? []); }, () => undefined); return () => { live = false; }; }, [state.revision]);
  const ownerName = state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '';
  const memberNames = projectMembers(state, 'carddemo').filter(member => member.status === 'active' && member.role === 'member').map(member => member.name).join(t('common.listSeparator'));
  return <ProjectContentTemplate projectId="carddemo" name={state.workspace.project.name} description={displayProjectDescription(state.workspace.project.description)} origin={<Origin kind="simulated" />}
    information={[
      { key: 'team', label: t('pc.team'), children: projectTeam(state, 'carddemo').name }, { key: 'owner', label: t('pc.ownerLabel'), children: ownerName },
      { key: 'repository', label: t('pc.repo'), span: 2, children: <Mono>{state.workspace.project.repository}</Mono> },
    ]}
    members={<><Descriptions size="small" column={1} items={[{ key: 'owner', label: ownerName + ' · ' + t('pc.ownerLabel'), children: t('pc.ownerDuties') }, { key: 'member', label: (memberNames || t('pc.noMembers')) + ' · ' + t('pc.memberLabel'), children: t('pc.memberDuties') }]} /><Button onClick={() => navigate('team?team=' + projectTeam(state, 'carddemo').id)}>{t('pc.viewTeamMembers')}</Button></>}
    assets={<ProjectAssets projectId="carddemo" />}
    knowledge={<ProjectKnowledge projectId="carddemo" />}
    requirements={<><RequirementMaterials /><div className="card-actions"><Button type="primary" onClick={() => navigate('projects?tab=delivery&node=prepare')}>{t('pc.enterClarification')}</Button></div></>}
    skills={data.skills.filter(skill => data.blueprint.skill_groups.some(group => group.skills.includes(skill.name))).map(skill => {
      const base = { ...skill, source: t('pc.adoptedSource'), displayPath: skill.path.slice(skill.path.indexOf('/workspace/') + 1), content: data.skillContents[skill.name] };
      const written = talentsSkills.find(version => version.skillId === skill.name);
      return written ? { ...base, version: written.version, source: t('pc.talentsImprovement', { version: written.basedOn.version, note: written.note }), content: written.files.find(file => file.path === 'SKILL.md')?.content ?? base.content } : base;
    })}
    skillFooter={<div className="project-skill-context"><div><strong>{t('pc.deliveryConfig')}</strong><p>{t('pc.deliveryConfigNote', { skill: state.adoptedSkill, agent: state.adoptedAgent })}</p><Tag color="green">{t('pc.availableInProject')}</Tag></div><Space wrap><Button type="primary" onClick={() => navigate('projects?tab=delivery&node=prepare')}>{t('pc.adoptInClarification')}</Button><Button onClick={() => navigate('resources')}>{t('pc.viewSharedCapabilities')}</Button>{role === 'owner' && <Button onClick={() => navigate('connections?tab=quality')}>{t('pc.maintainQuality')}</Button>}</Space></div>}
  />;
}

export function RequirementMaterials() {
  const { state, role, update, busy, showText, showEvidence } = useDemo();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm();
  return <><div className="project-material-list"><div className="project-material"><FileTextOutlined /><div><strong>白金卡消费返现需求</strong><small>{t('pc.materialSource')}</small></div><Button size="small" onClick={() => showEvidence('E1')}>{t('pc.view')}</Button></div>
    {state.workspace.materials.map(material => <div className="project-material" key={material.id}><FileTextOutlined /><div><strong>{material.title}</strong><small>{t('pc.memberSupplement')}</small></div><Button size="small" onClick={() => showText(material.title, material.body)}>{t('pc.view')}</Button></div>)}</div>
    {role === 'member' && <Button className="project-material-add" icon={<PlusOutlined />} disabled={!!state.context} onClick={() => setAdding(true)}>{t('pc.addMaterial')}</Button>}
    {state.context && <p className="muted">{t('pc.contextFrozen')}</p>}
    <Modal open={adding} title={t('pc.addMaterial')} okText={t('pc.saveMaterial')} onCancel={() => setAdding(false)} confirmLoading={busy} onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={async value => { const saved = await update('material.add', value); if (saved) { form.resetFields(); setAdding(false); } }}>
        <Form.Item name="title" label={t('pc.field.title')} rules={[{ required: true, whitespace: true }]}><Input maxLength={120} placeholder={t('pc.field.titlePlaceholder')} /></Form.Item>
        <Form.Item name="body" label={t('pc.field.body')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={6} maxLength={5000} placeholder={t('pc.field.bodyPlaceholder')} /></Form.Item>
      </Form>
    </Modal>
  </>;
}

export function ProjectManagement() { return <ProjectTaskManagement projectId="carddemo" />; }

export function ProjectRelease() {
  const { state, navigate } = useDemo();
  const t = useT();
  return <div className="page-stack"><FrameworkCard title="信用卡营销 · v0.1" action={<Tag color={state.stage === 'accepted' ? 'green' : 'gold'}>{state.stage === 'accepted' ? t('pc.release.confirmed') : t('pc.release.preparing')}</Tag>}><Descriptions column={1} items={[{ key: 'scope', label: t('pc.release.scope'), children: '信用卡消费返现 · MKT-001' }, { key: 'result', label: t('pc.release.status'), children: t(stageKeys[state.stage]) }, { key: 'safety', label: t('pc.release.safety'), children: <Tag color="gold">{t('pc.release.toVerify')}</Tag> }, { key: 'release', label: t('pc.release.facts'), children: t('pc.release.noDeploy') }]} /><p>{t('pc.release.note')}</p><Space wrap><Button type="primary" onClick={() => navigate('projects?tab=delivery&node=accept')}>{t('pc.release.viewDelivery')}</Button><Button onClick={() => navigate('trace')}>{t('pc.release.viewTrace')}</Button></Space></FrameworkCard></div>;
}

export function ProjectSettings() {
  const { state, role, update, busy, navigate } = useDemo();
  const t = useT();
  const ownerName = state.workspace.team.members.find(item => item.id === 'owner')?.name ?? '';
  const memberNames = projectMembers(state, 'carddemo').filter(member => member.status === 'active' && member.role === 'member').map(member => member.name).join(t('common.listSeparator'));
  return <div className="page-stack"><FrameworkCard title={t('pc.basicInfo')}><Form key={state.workspace.project.name + state.workspace.project.repository} layout="vertical" initialValues={{ ...state.workspace.project, description: displayProjectDescription(state.workspace.project.description) }} disabled={role !== 'owner'} onFinish={value => update('project.update', value)}>
    <Form.Item name="name" label={t('pc.field.name')} rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item><Form.Item name="description" label={t('pc.field.description')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={1000} /></Form.Item><Form.Item name="repository" label={t('pc.field.repository')} rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item>{role === 'owner' && <Button type="primary" htmlType="submit" loading={busy}>{t('pc.saveProject')}</Button>}
  </Form></FrameworkCard><FrameworkCard title={t('pc.membersTitle')} action={<Origin kind="simulated" />}><Descriptions size="small" items={[{ key: 'team', label: t('pc.team'), children: projectTeam(state, 'carddemo').name }, { key: 'stage', label: t('pc.stage'), children: t(stageKeys[state.stage]) }]} /><Descriptions bordered column={1} items={[{ key: 'owner', label: ownerName + ' · ' + t('pc.ownerLabel'), children: t('pc.ownerDuties') }, { key: 'member', label: (memberNames || t('pc.noMembers')) + ' · ' + t('pc.memberLabel'), children: t('pc.memberDuties') }]} /><Button onClick={() => navigate('team?team=' + projectTeam(state, 'carddemo').id)}>{t('pc.viewTeamMembers')}</Button></FrameworkCard></div>;
}
