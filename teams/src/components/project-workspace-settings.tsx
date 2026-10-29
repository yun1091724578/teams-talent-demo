import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';
import { getProjectWorkspaces, saveProjectWorkspace } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import type { ProjectWorkspaces } from '../project-workspace.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';

export function ProjectWorkspaceSettings({ projectId, onSaved }: {projectId: string; onSaved: (value: ProjectWorkspaces) => void}) {
  const { role, state } = useDemo();
  const t = useT();
  const [config, setConfig] = useState<ProjectWorkspaces>();
  const [directory, setDirectory] = useState(''), [remoteUrl, setRemoteUrl] = useState(''), [baseBranch, setBaseBranch] = useState('main');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => { let live = true; getProjectWorkspaces().then(value => { if (live) {setConfig(value);} }).catch(error => {if(live)setError(error.message);}); return () => {live=false;}; }, [projectId]);
  useEffect(() => {
    const selected = config?.projects.find(item => item.projectId === projectId);
    setDirectory(selected?.directory ?? ''); setRemoteUrl(selected?.remoteUrl ?? (projectId === 'carddemo' ? 'https://github.com/JeffyLiu003/carddemo-java-1025.git' : projectId === 'teams' ? 'https://github.com/SEAL-iCode/iCode-teams.git' : state.workspace.projects?.find(project=>project.id===projectId)?.remoteUrl ?? ''));
    setBaseBranch(selected?.baseBranch ?? 'main');
  }, [config, projectId]);
  return <FrameworkCard title={t('pws.title')}>
    <Typography.Paragraph type="secondary">{t('pws.note')}</Typography.Paragraph>
    <Form layout="vertical" onFinish={() => {setBusy(true);setError('');setSaved(false);void saveProjectWorkspace(role,{projectId,directory,remoteUrl,baseBranch}).then(value => {setConfig(value);setSaved(true);onSaved(value);}).catch(error => setError(error.message)).finally(() => setBusy(false));}}>
      <Form.Item label={t('pws.directory')} htmlFor="project-workspace-directory" required><Input id="project-workspace-directory" value={directory} onChange={event => {setDirectory(event.target.value);setSaved(false);}} placeholder={t('pws.directoryPlaceholder')} /></Form.Item>
      <Space.Compact block><Form.Item label={t('pws.remote')} htmlFor="project-workspace-remote" required style={{flex:3}}><Input id="project-workspace-remote" value={remoteUrl} onChange={event => {setRemoteUrl(event.target.value);setSaved(false);}} /></Form.Item><Form.Item label={t('pws.base')} htmlFor="project-workspace-base" required style={{flex:1}}><Input id="project-workspace-base" value={baseBranch} onChange={event => {setBaseBranch(event.target.value);setSaved(false);}} /></Form.Item></Space.Compact>
      <Space><Button htmlType="submit" type="primary" loading={busy} disabled={!config || !directory.trim() || !remoteUrl.trim() || !baseBranch.trim()}>{t('pws.save')}</Button><Typography.Text type="secondary">{t('pws.saveNote')}</Typography.Text></Space>
    </Form>
    {error && <Alert type="error" showIcon title={t('pws.saveFailed')} description={error} />}
    {saved && <Alert type="success" showIcon title={t('pws.saved')} />}
  </FrameworkCard>;
}
