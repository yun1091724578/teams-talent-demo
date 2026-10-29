import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Tag, Typography } from 'antd';
import { getProjectWorkspaces } from '../api.js';
import type { ProjectWorkspace } from '../project-workspace.js';
import { ProjectWorkspaceSettings } from './project-workspace-settings.js';
import './project-workspace-summary.css';

/** Project-local entry; selecting another project never displays the device default's directory. */
export function ProjectWorkspaceSummary({ projectId }: {projectId: string}) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>(), [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let live=true;setLoading(true);setWorkspace(undefined);setError('');
    getProjectWorkspaces().then(value=>{if(live)setWorkspace(value.projects.find(item=>item.projectId===projectId));})
      .catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[projectId]);
  return <>
    <section className="project-workspace-summary" aria-label="项目工作区" data-project-workspace={projectId}>
      <strong>项目工作区</strong>
      <Typography.Text className="project-workspace-path" ellipsis={{tooltip:true}} type={workspace?undefined:'secondary'}>{loading?'正在读取本机配置…':error?'工作区读取失败':workspace?.directory??'尚未配置本机工作区'}</Typography.Text>
      {workspace&&<Tag>基线 {workspace.baseBranch}</Tag>}
      <span className="muted">当前设备</span>
      <Button size="small" onClick={()=>setOpen(true)}>工作区设置</Button>
    </section>
    {error&&<Alert type="error" showIcon title="无法读取项目工作区" description={error}/>}
    <Drawer title="工作区设置" width={720} open={open} onClose={()=>setOpen(false)} destroyOnHidden>
      <ProjectWorkspaceSettings key={projectId} projectId={projectId} onSaved={value=>{setWorkspace(value.projects.find(item=>item.projectId===projectId));setError('');setOpen(false);}}/>
    </Drawer>
  </>;
}
