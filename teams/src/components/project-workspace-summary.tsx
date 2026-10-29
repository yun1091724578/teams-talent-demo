import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Tag, Typography } from 'antd';
import { getProjectWorkspaces } from '../api.js';
import { useT } from '../i18n.js';
import type { ProjectWorkspace } from '../project-workspace.js';
import { ProjectWorkspaceSettings } from './project-workspace-settings.js';
import './project-workspace-summary.css';

/** Project-local entry; selecting another project never displays the device default's directory. */
export function ProjectWorkspaceSummary({ projectId }: {projectId: string}) {
  const t = useT();
  const [workspace, setWorkspace] = useState<ProjectWorkspace>(), [loading, setLoading] = useState(true);
  // #/projects?…&workspace=settings (e.g. from Talents, for a repository it cannot use yet) opens the settings.
  const [open, setOpen] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('workspace') === 'settings'), [error, setError] = useState('');
  useEffect(() => {
    let live=true;setLoading(true);setWorkspace(undefined);setError('');
    getProjectWorkspaces().then(value=>{if(live)setWorkspace(value.projects.find(item=>item.projectId===projectId));})
      .catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[projectId]);
  return <>
    <section className="project-workspace-summary" aria-label={t('pw.title')} data-project-workspace={projectId}>
      <strong>{t('pw.title')}</strong>
      <Typography.Text className="project-workspace-path" ellipsis={{tooltip:true}} type={workspace?undefined:'secondary'}>{loading?t('pw.reading'):error?t('pw.readFailed'):workspace?.directory??t('pw.notConfigured')}</Typography.Text>
      {workspace&&<Tag>{t('pw.baseline', { branch: workspace.baseBranch })}</Tag>}
      <span className="muted">{t('pw.currentDevice')}</span>
      <Button size="small" onClick={()=>setOpen(true)}>{t('pw.settings')}</Button>
    </section>
    {error&&<Alert type="error" showIcon title={t('pw.cannotRead')} description={error}/>}
    <Drawer title={t('pw.settings')} width={720} open={open} onClose={()=>setOpen(false)} destroyOnHidden>
      <ProjectWorkspaceSettings key={projectId} projectId={projectId} onSaved={value=>{setWorkspace(value.projects.find(item=>item.projectId===projectId));setError('');setOpen(false);}}/>
    </Drawer>
  </>;
}
