import { projectDeliveryTasks } from '../project-delivery-tasks.js';
import { labelText } from '../task-labels-en.js';
import { taskExecutableBy } from '../task-visibility.js';
import { type RequirementNode } from '../delivery-requirements.js';
import { deliveryNodeLabels } from '../components/task-delivery-layout.js';
import { DeliveryTaskSidebar, type DeliveryTaskListItem } from '../components/delivery-task-sidebar.js';
import { LiveTaskDelivery } from '../components/live-task-delivery.js';
import { TaskExecutionRecords } from '../components/task-execution-records.js';
import { ImportedTaskDelivery } from '../components/imported-task-delivery.js';
import { importedSelectedStage, importedStage } from '../imported-delivery.js';
import { ProjectTaskManagement } from '../components/project-task-management.js';
import { displayText } from '../display-text.js';
import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Space, Table, Tag } from 'antd';
import { ArrowRightOutlined, FileTextOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT } from '../../../shared/i18n/index.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { Mono } from '../components/common.js';
import { ProjectToolbar, projectPages as tabs } from '../components/project-toolbar.js';
import { ProjectContentTemplate } from '../components/project-content-template.js';
import { ProjectAssets } from '../components/project-assets.js';
import { ProjectKnowledge } from '../components/project-knowledge.js';
import { ProjectWorkLaunch } from '../components/project-work-launch.js';
import '../teams-project.css';

/** The imported snapshot's own team name is source data, so it stays untranslated. */
const sourceTeamName = 'Teams 开发团队';
function SourceTag() { const t = useT(); return <Tag color="blue">{t('tp.sourceTag')}</Tag>; }
const teamRoute = (tab:string, extra:Record<string,string>={}) => 'projects?'+new URLSearchParams({project:'teams',tab,...extra}).toString();
const memberName = (id:string) => id==='U' ? currentT('tp.unassigned') : currentT('tp.member', { id });

export function TeamsProjectCard() {
  const {state,data,role,navigate}=useDemo(),s=data.teamsProject,p=s.project;
  const t=useT();
  return <FrameworkCard title={p.name} action={<SourceTag />}><p>{displayText(p.description)}</p><Descriptions size="small" column={2} items={[{key:'team',label:t('tp.teamLabel'),children:sourceTeamName},{key:'owner',label:t('tp.ownerLabel'),children:memberName(p.owner)},{key:'repo',label:t('tp.repoLabel'),children:p.repos[0].name},{key:'scope',label:t('tp.scopeLabel'),children:t('tp.scopeValue', { tasks: s.tasks.length + projectDeliveryTasks(state, 'teams', role).length, releases: s.releases.length })}]} /><Space wrap><Button type="primary" data-project-primary="teams" aria-label={(role==='owner'?t('tp.enterManagementAria', { name: p.name }):t('tp.enterDeliveryAria', { name: p.name }))} onClick={()=>navigate(teamRoute(role==='owner'?'management':'delivery'))}>{role==='owner'?t('tp.enterManagement'):t('tp.enterDelivery')}</Button><Button onClick={()=>navigate(teamRoute('content'))}>{t('tp.content')}</Button>{role==='owner'&&<Button onClick={()=>navigate(teamRoute('delivery'))}>{t('tp.delivery')}</Button>}</Space></FrameworkCard>;
}

export function TeamsProject({params}:{params:URLSearchParams}) {
  const {state,data,role,navigate,showText}=useDemo(),s=data.teamsProject,p=s.project;
  const t=useT();
  const tab=params.get('tab')??'content';
  const [sessions,setSessions]=useState(false);
  const localTasks = projectDeliveryTasks(state, 'teams', role);
  const selectedId = params.get('task') ?? localTasks.find(task => taskExecutableBy(role, task.assigneeId))?.id ?? s.selection.taskId;
  const localTask = localTasks.find(task => task.id === selectedId);
  const localNode = params.get('node') ?? localTask?.node ?? 'prepare';
  const validLocalNode = Object.hasOwn(deliveryNodeLabels, localNode);
  const selectedTask = s.tasks.find(task => task.id === selectedId);
  const sidebarItems: DeliveryTaskListItem[] = [
    ...localTasks,
    ...s.tasks.map(task => ({ id: task.id, title: task.title, owner: memberName(task.owner), status: labelText(task.status), accepted: task.status === '已验收', route: teamRoute('delivery', { task: task.id, node: importedSelectedStage(task, null, task.id === s.selection.taskId ? s.selection.nodeId : undefined)! }) })),
  ];
  const selectedStage = selectedTask ? importedSelectedStage(selectedTask, params.get('node'), selectedTask.id === s.selection.taskId ? s.selection.nodeId : undefined) : undefined;
  const sourceStage = selectedTask && selectedStage ? importedStage(selectedTask, selectedStage) : undefined;
  const sourceWorkNode = selectedTask?.nodes.find(node => node.id === params.get('node')) ?? sourceStage?.primary;
  const visibleSessions = tab === 'delivery' ? s.sessions.filter(session => session.target.task === selectedTask?.id && sourceStage?.nodes.some(node => node.id === session.target.node)) : s.sessions;
  useEffect(() => setSessions(false), [tab, selectedId, selectedStage, localNode, role]);
  const document=(path:string)=>{const doc=s.documents.find(d=>d.path===path);showText(path,doc?.content??t('tp.fileMissing'));};
  const jump=(tab:string,extra:Record<string,string>={})=>navigate(teamRoute(tab,extra));
  if(!tabs.some(page=>page.key===tab))return <Alert type="error" title={t('tp.pageMissing')} action={<Button onClick={()=>jump('content')}>{t('tp.enterOverview')}</Button>}/>;
  return <div className="page-stack teams-imported-project project-detail">
    <ProjectToolbar activeKey={tab} onChange={value=>jump(value)} actions={<>
      {localTask && tab === 'delivery' ? <Tag>{t('tp.localTaskTag')}</Tag> : <SourceTag />}
      <Button type="text" icon={<FileTextOutlined/>} aria-label={t('tp.dataSource')} title={t('tp.dataSource')} onClick={()=>showText(t('tp.sourceTitle'),t('tp.sourceText')+'\n\n'+JSON.stringify({commit:s.sourceCommit,importedAt:s.importedAt,files:s.sourceFiles},null,2))}><span className="project-secondary-action-label">{t('tp.dataSource')}</span></Button>
      {localTask?.record ? <TaskExecutionRecords key={selectedId + ':' + role} task={localTask.record} /> : selectedTask || tab !== 'delivery' ? <Button type="text" icon={<FileTextOutlined/>} aria-label={t('tp.executionRecordsAria')} onClick={()=>setSessions(true)}><span className="project-secondary-action-label">{t('tp.execution')}</span></Button> : null}
      {(tab !== 'delivery' || localTask && validLocalNode || sourceWorkNode) && <ProjectWorkLaunch target={{projectId:'teams',tab,...(tab === 'delivery' ? localTask ? {taskId: localTask.id, nodeId: localNode} : selectedTask && sourceWorkNode ? {taskId: selectedTask.id, nodeId: sourceWorkNode.id} : {} : {}),...(params.get('discussion')?{discussionId:params.get('discussion')!}:{}),...(params.get('release')?{releaseId:params.get('release')!}:{})}} />}
    </>}/>
    {tab==='content'?<ProjectContentTemplate projectId="teams" name={p.name} description={displayText(p.description)} origin={<SourceTag />}
      information={[{key:'team',label:t('tp.teamLabel'),children:sourceTeamName},{key:'owner',label:t('tp.ownerLabel'),children:memberName(p.owner)},
        {key:'repository',label:t('tp.repoLabel'),span:2,children:<>{p.repos.map(repo=><div key={repo.name}><strong>{repo.name}</strong> <Tag>{repo.branch}</Tag><Mono>{repo.path}</Mono><p className="muted">{displayText(repo.note)}</p></div>)}</>},
        {key:'directory',label:t('tp.directoryLabel'),span:2,children:t('tp.directoryValue', { note: p.repoNote })},
        {key:'scope',label:t('tp.scopeLabel'),span:2,children:t('tp.scopeDetail', { tasks: s.tasks.length + localTasks.length, inputs: s.inputs.length, discussions: s.discussions.length, releases: s.releases.length })},
      ]}
      members={<><Table size="small" pagination={false} rowKey="id" dataSource={s.members} columns={[{title:t('tp.memberColumn'),dataIndex:'name'},{title:t('tp.roleColumn'),dataIndex:'role'}]}/><p className="muted">{t('tp.membersNote')}{displayText(p.phase)}</p></>}
      assets={<ProjectAssets projectId="teams" extra={<><p>{displayText(p.agentsNote)}</p><Button onClick={()=>document('AGENTS.md')}>{t('tp.viewAgents')}</Button></>} />}
      knowledge={<ProjectKnowledge projectId="teams" />}
      requirements={<><div className="talent-rule-grid">{p.sources.map(source=><div key={source.name}><h3>{source.name}</h3><p>{displayText(source.description)}</p><Tag>{source.status}</Tag></div>)}</div><p className="muted">{displayText(p.runtime)}</p><Button onClick={()=>jump('management')}>{t('tp.enterManagement')} <ArrowRightOutlined/></Button></>}
      skills={p.skills.map(skill=>{const path='.agents/skills/'+skill.name+'/SKILL.md';return {...skill,version:t('tp.sourceSnapshot', { commit: s.sourceCommit.slice(0,7) }),source:t('tp.sourceSnapshotName'),path,content:s.documents.find(doc=>doc.path===path)?.content};})}
      skillFooter={<div className="project-skill-context"><p>{t('tp.skillNote')}</p><Button onClick={()=>jump('delivery',{task:s.selection.taskId,node:'prepare'})}>{t('tp.viewClarification')}</Button></div>}
    />:tab==='management'?<ProjectTaskManagement projectId="teams"/>:tab==='delivery'?localTask?.record ? validLocalNode ? <LiveTaskDelivery key={localTask.id + ':' + role} task={localTask.record} node={localNode as RequirementNode} sidebarItems={sidebarItems} /> : <Alert type="error" title={t('tp.nodeMissing')} action={<Button onClick={() => jump('delivery', { task: localTask.id })}>{t('tp.backToTask')}</Button>} /> : selectedTask ? <ImportedTaskDelivery snapshot={s} params={new URLSearchParams({ ...Object.fromEntries(params), task: selectedTask.id })} jump={jump} sidebarItems={sidebarItems} /> : <div className="project-delivery-layout without-background"><DeliveryTaskSidebar projectId="teams" selectedTaskId="" items={sidebarItems} /><Alert type="info" title={t('tp.taskMissing')} action={<Button onClick={() => jump('delivery')}>{t('tp.viewProjectTasks')}</Button>} /></div>:null}
    <Drawer title={tab === 'delivery' ? t('tp.drawerDeliveryTitle', { id: selectedTask?.id ?? '' }) : t('tp.drawerTitle')} open={sessions && !localTask} onClose={()=>setSessions(false)} width={650}><div className="page-stack"><Alert type="info" title={t('tp.jobContext')} description={t('tp.jobContextNote')}/>{visibleSessions.length === 0 && <Empty description={t('tp.noJobSnapshots')}/>}{visibleSessions.map(session=><FrameworkCard key={session.key} title={displayText(session.title)} action={<Tag>{displayText(session.status)}</Tag>}><p>{displayText(session.location)} · {memberName(session.owner)}</p><h3>{displayText(session.resultTitle)}</h3><p>{displayText(session.resultText)}</p>{session.target.page!=='release'&&<Button onClick={()=>{setSessions(false);const target=session.target;jump(target.page,{...(target.item?{discussion:target.item}:{}),...(target.task?{task:target.task}:{}),...(target.node?{node:target.node}:{}),...(target.version?{release:target.version}:{})});}}>{t('tp.viewRelated')}</Button>}<Button type="link" onClick={()=>showText(session.short+' · '+t('tp.jobContextSuffix'),JSON.stringify(session,null,2))}>{t('tp.viewFullContext')}</Button></FrameworkCard>)}</div></Drawer>
  </div>;
}
