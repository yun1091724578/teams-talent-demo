import {useTaskNodeInputs} from './use-task-node-inputs.js';
import { Alert, Button, Collapse, Empty, List, Space, Tag } from 'antd';
import type { Presentation } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { displayText, selectionNote } from '../display-text.js';
import { labelText } from '../task-labels-en.js';
import { deliveryStages, importedSelectedStage, importedStage, importedTaskNodeView } from '../imported-delivery.js';
import { TaskNodeArtifacts, TaskCompletionCriteria, nodeArtifactSummary } from './task-node-artifacts.js';
import { TaskDeliveryLayout, deliveryNodeLabels } from './task-delivery-layout.js';
import { DeliveryTaskSidebar, type DeliveryTaskListItem } from './delivery-task-sidebar.js';
import { TaskSessionActivity } from './task-session-activity.js';
import { TaskDeliveryFlow, importedStatusTones } from './task-delivery-flow.js';

export function ImportedTaskDelivery({ snapshot: s, params, jump, sidebarItems }: { sidebarItems?: readonly DeliveryTaskListItem[]; snapshot: Presentation['teamsProject']; params: URLSearchParams; jump(tab: string, extra?: Record<string, string>): void }) {
  const { showText, role } = useDemo();
  const t = useT();

  const task = s.tasks.find(item => item.id === (params.get('task') ?? s.selection.taskId));
  if (!task) return <Alert type="error" title={t('itd.taskMissing')} action={<Button onClick={() => jump('management')}>{t('itd.viewTaskList')}</Button>} />;
  const node = importedSelectedStage(task, params.get('node'), task.id === s.selection.taskId ? s.selection.nodeId : undefined);
  if (!node) return <Alert type="error" title={t('itd.nodeMissing')} action={<Button onClick={() => jump('delivery', { task: task.id })}>{t('itd.backToTask')}</Button>} />;
  return <ImportedTaskBody key={task.id+':'+node+':'+role} s={s} task={task} node={node} jump={jump} sidebarItems={sidebarItems}/>;
}
function ImportedTaskBody({s,task,node,jump,sidebarItems}:{sidebarItems?:readonly DeliveryTaskListItem[];s:Presentation['teamsProject'];task:Presentation['teamsProject']['tasks'][number];node:import('../delivery-requirements.js').RequirementNode;jump(tab:string,extra?:Record<string,string>):void}){
  const {showText,role,data}=useDemo();
  const t = useT();
  const inputsRead=useTaskNodeInputs('teams',task.id,node);
  const view = importedTaskNodeView(task, node,inputsRead.value,data);
  const go = (node: string) => jump('delivery', { task: task.id, node });
  const selected = importedStage(task, node), sourceIds = new Set(selected.nodes.map(item => item.id));
  const sessions = s.sessions.filter(session => session.target.task === task.id && session.target.node && sourceIds.has(session.target.node));
  const detail = (title: string, value: unknown) => showText(task.id + ' · ' + title, JSON.stringify(value, null, 2));
  const previous = deliveryStages.slice(0, deliveryStages.indexOf(node)).flatMap(id => importedStage(task, id).outputs);
  const route = (id: string, stage: string) => 'projects?' + new URLSearchParams({ project: 'teams', tab: 'delivery', task: id, node: stage });
  const input = <>
    <p className="task-node-requirement">{displayText(task.goal)}</p>
    {inputsRead.error&&<Alert type="warning" title={t('itd.inputsFailed')} description={inputsRead.error} action={<Button onClick={inputsRead.refresh}>{t('itd.refetch')}</Button>}/>}
    <p className="muted">{selectionNote(inputsRead.value?.selection)??(inputsRead.pending?t('itd.readingInputs'):t('itd.noInputs'))}</p>
    <TaskNodeArtifacts items={view.inputs} onSource={go} />
    <div className="task-node-input-summary"><span>{t('itd.sourceVersion', { version: task.version })}</span><span>{t('itd.sourceNodeCount', { count: selected.nodes.length })}</span><span>{t('itd.noAdoption')}</span></div>
    {task.type === '调研' && <p className="muted">{t('itd.researchNote')}</p>}
    <Collapse ghost size="small" items={[{ key: 'inputs', label: t('itd.viewRequirement'), children: <div className="page-stack"><p>{t('itd.scope', { scope: displayText(task.scope) })}</p><ul>{task.criteria.map(item => <li key={item}>{item}</li>)}</ul><p className="muted">{t('itd.sourceLine', { origin: displayText(task.origin), commit: s.sourceCommit.slice(0, 7) })}</p><List size="small" header={t('itd.upstream')} dataSource={previous} locale={{ emptyText: t('itd.noUpstream') }} renderItem={item => <List.Item><div><strong>{item.name}</strong><p>{displayText(item.output)}</p></div></List.Item>} /><Button size="small" onClick={() => detail(t('itd.fullTaskSource'), task)}>{t('itd.viewTaskData')}</Button></div> }]} />
  </>;
  const execution = <>
    <div className="task-node-execution-summary"><span>{t('itd.sourceStatus', { status: labelText(selected.status) })}</span><span>{t('itd.sessionSnapshotCount', { count: sessions.length })}</span></div>
    <p className="muted">{t('itd.executionNote')}</p>
    <section className="task-process-progress" aria-label={t('itd.progressAria')}><h3>{t('itd.progress')}</h3><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('itd.noProgress')} /></section>
    <TaskSessionActivity key={task.id + ':' + node + ':' + role} projectId="teams" taskId={task.id} nodeId={node} readonlySource />
    {selected.nodes.length ? <Collapse ghost size="small" items={[{ key: 'records', label: t('itd.viewOriginalNodes'), children: <div className="page-stack"><List size="small" dataSource={selected.nodes} renderItem={item => <List.Item data-imported-source-node={item.id}><div><Space wrap><strong>{item.name}</strong><Tag>{labelText(item.status)}</Tag><span className="muted">{item.owner}</span></Space><p className="task-node-fulltext">{displayText(item.brief)}</p><Button size="small" onClick={() => detail(t('itd.nodeDataTitle', { name: item.name }), item)}>{t('itd.viewNodeDetail')}</Button></div></List.Item>} />{sessions.map(session => <div key={session.key} data-imported-session={session.key}><strong>{displayText(session.title)}</strong><p>{displayText(session.resultText)}</p><Button size="small" onClick={() => detail(t('itd.jobContext'), session)}>{t('itd.viewJobContext')}</Button></div>)}</div> }]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('itd.noStageRecords')} />}
  </>;
  const result = <>
    <p>{t('itd.resultNote')}</p>
    <h3 className="task-deliverables-heading">{t('itd.deliverables')}</h3><TaskNodeArtifacts items={view.deliverables} onSource={go} /><TaskCompletionCriteria view={view} />

    {node === 'verify' && <p className="muted">{t('itd.verifyNote')}</p>}
    {node === 'accept' && <p className="muted">{t('itd.acceptNote')}</p>}
  </>;
  return <TaskDeliveryLayout projectId="teams" taskId={task.id} title={task.title} owner={t('itd.memberOwner', { name: task.owner })} node={node} nodeOwner={t('itd.nodeOwner', { name: selected.owner })} contentKey={task.id + ':' + node + ':' + role}
    sidebar={<DeliveryTaskSidebar projectId="teams" selectedTaskId={task.id} items={sidebarItems ?? s.tasks.map(item => ({ id: item.id, title: item.title, owner: t('itd.memberOwner', { name: item.owner }), status: labelText(item.status), accepted: item.status === '已验收', route: route(item.id, importedSelectedStage(item, null, item.id === s.selection.taskId ? s.selection.nodeId : undefined)!) }))} />}
    flow={<TaskDeliveryFlow scope={{ projectId: 'teams', taskId: task.id }} nodeInputs={inputsRead.value} readonly selected={node} onSelect={id => jump('delivery', { task: task.id, node: id })} nodes={deliveryStages.map(id => { const stage = importedStage(task, id); return { id, label: deliveryNodeLabels[id], role: stage.owner, description: '', status: labelText(stage.status), statusTone: importedStatusTones[stage.status] ?? 'default', complete: false, summary: nodeArtifactSummary(importedTaskNodeView(task, id)) }; })} />}
    sections={{ input: { action: <Tag>{t('itd.originalInput')}</Tag>, content: input }, execution: { action: <Tag>{t('itd.sourceReadOnly')}</Tag>, content: execution }, result: { content: result } }}
    materials={<><h4>{t('itd.requirement')}</h4><div className="task-material-description"><p>{displayText(task.goal)}</p><p>{t('itd.scope', { scope: displayText(task.scope) })}</p></div><h4>{t('itd.criteria')}</h4><ul className="task-material-criteria">{task.criteria.map(item => <li key={item}>{item}</li>)}</ul><h4>{t('itd.sourceMaterials')}</h4><p>{displayText(task.origin)}</p><p className="muted">{t('itd.sourceMeta', { version: task.version, due: task.due })}</p><Button type="link" size="small" onClick={() => detail(t('itd.fullTaskSource'), task)}>{t('itd.viewTaskData')}</Button></>}
  />;
}
