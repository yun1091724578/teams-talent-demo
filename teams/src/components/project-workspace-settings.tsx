import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';
import { getProjectWorkspaces, saveProjectWorkspace } from '../api.js';
import { useDemo } from '../context.js';
import type { ProjectWorkspaces } from '../project-workspace.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';

export function ProjectWorkspaceSettings({ projectId, onSaved }: {projectId: string; onSaved: (value: ProjectWorkspaces) => void}) {
  const { role, state } = useDemo();
  const [config, setConfig] = useState<ProjectWorkspaces>();
  const [directory, setDirectory] = useState(''), [remoteUrl, setRemoteUrl] = useState(''), [baseBranch, setBaseBranch] = useState('main');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => { let live = true; getProjectWorkspaces().then(value => { if (live) {setConfig(value);} }).catch(error => {if(live)setError(error.message);}); return () => {live=false;}; }, [projectId]);
  useEffect(() => {
    const selected = config?.projects.find(item => item.projectId === projectId);
    setDirectory(selected?.directory ?? ''); setRemoteUrl(selected?.remoteUrl ?? (projectId === 'carddemo' ? 'https://github.com/JeffyLiu003/carddemo-java-1025.git' : projectId === 'teams' ? 'https://github.com/SEAL-iCode/iCode-teams.git' : state.workspace.projects?.find(project=>project.id===projectId)?.remoteUrl ?? ''));
    setBaseBranch(selected?.baseBranch ?? 'main');
  }, [config, projectId]);
  return <FrameworkCard title="项目工作区">
    <Typography.Paragraph type="secondary">绑定本机的独立业务仓库。iCode、OpenCode 与新需求共用此配置；每个新需求从交付基线创建独立工作区，已有任务与会话保留原目录。</Typography.Paragraph>
    <Form layout="vertical" onFinish={() => {setBusy(true);setError('');setSaved(false);void saveProjectWorkspace(role,{projectId,directory,remoteUrl,baseBranch}).then(value => {setConfig(value);setSaved(true);onSaved(value);}).catch(error => setError(error.message)).finally(() => setBusy(false));}}>
      <Form.Item label="Workspace · 本机仓库根目录" htmlFor="project-workspace-directory" required><Input id="project-workspace-directory" value={directory} onChange={event => {setDirectory(event.target.value);setSaved(false);}} placeholder="例如 /Users/you/work/carddemo-java-1025 或 D:\projects\carddemo-java-1025" /></Form.Item>
      <Space.Compact block><Form.Item label="Git 仓库地址" htmlFor="project-workspace-remote" required style={{flex:3}}><Input id="project-workspace-remote" value={remoteUrl} onChange={event => {setRemoteUrl(event.target.value);setSaved(false);}} /></Form.Item><Form.Item label="交付基线分支" htmlFor="project-workspace-base" required style={{flex:1}}><Input id="project-workspace-base" value={baseBranch} onChange={event => {setBaseBranch(event.target.value);setSaved(false);}} /></Form.Item></Space.Compact>
      <Space><Button htmlType="submit" type="primary" loading={busy} disabled={!config || !directory.trim() || !remoteUrl.trim() || !baseBranch.trim()}>保存工作区</Button><Typography.Text type="secondary">仅保存当前项目在此设备上的配置，并作为本机工具默认启动目录。路径、origin 和基线分支均会核验。</Typography.Text></Space>
    </Form>
    {error && <Alert type="error" showIcon title="工作区未保存" description={error} />}
    {saved && <Alert type="success" showIcon title="工作区已保存，新需求使用独立业务仓库。" />}
  </FrameworkCard>;
}
