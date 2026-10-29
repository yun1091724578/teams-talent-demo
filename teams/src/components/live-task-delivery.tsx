import { TaskKnowledgeSources } from './task-knowledge-sources.js';
import { TaskPreparationProgress, preparationHint, preparationStatusLabel, preparationReady } from './task-preparation-progress.js';
import {useTaskNodeInputs} from './use-task-node-inputs.js';
import {taskExecutableBy} from '../task-visibility.js';
import { useState } from 'react';
import { Alert, Button, Collapse, Empty, Input, List, Modal, Space, Tag, Typography } from 'antd';
import { taskNodeView } from '../task-node-contract.js';
import { TaskNodeArtifacts, TaskCompletionCriteria, nodeArtifactSummary } from './task-node-artifacts.js';
import { RequirementConfirmations } from './requirement-confirmations.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { selectionNote } from '../display-text.js';
import { currentT } from '../../../shared/i18n/index.js';
import { type DeliveryRequirement, type RequirementNode } from '../delivery-requirements.js';
import { deliveryRequirementAction } from '../api.js';
import { collectTaskSessions, taskAutomation, taskNodeKnowledge } from '../task-automation.js';
import { projectMembers } from '../teams-domain.js';
import { taskVisibleTo } from '../task-visibility.js';
import { TaskDeliveryFlow, knowledgeLabels, nodeStatusTones, preparationStatusTones } from './task-delivery-flow.js';
import { CollaborationProgress } from './collaboration-progress.js';
import { TaskSessionActivity } from './task-session-activity.js';
import { TaskSessions } from './task-sessions.js';
import { DeliveryTaskSidebar, type DeliveryTaskListItem } from './delivery-task-sidebar.js';
import { TaskDeliveryLayout, deliveryNodeLabels } from './task-delivery-layout.js';
export { deliveryNodeLabels } from './task-delivery-layout.js';

const statusKeys = { pending: 'phase.pending', running: 'gt.active', blocked: 'ter.blocked', complete: 'gt.completed', 'waiting-owner': 'qr.awaitingOwner' } as const;
const stamp = (at?: string | null) => at ? new Date(at).toLocaleString('zh-CN') : currentT('lt.noExecutionTime');
const firstSentence = (text: string) => text.split(/(?<=。)|\n/).find(part => part.trim())?.trim() ?? '';

export function LiveTaskDelivery({ task, node, sidebarItems }: { task: DeliveryRequirement; node: RequirementNode; sidebarItems?: readonly DeliveryTaskListItem[] }) {
  const { state, data, role, navigate, receiveState, run, showText } = useDemo();
  const t = useT();
  const statusLabels = { pending: t('phase.pending'), running: t('gt.active'), blocked: t('ter.blocked'), complete: t('gt.completed'), 'waiting-owner': t('qr.awaitingOwner') };
  const [busy, setBusy] = useState(false), [accepting, setAccepting] = useState(false), [returning, setReturning] = useState(false), [reason, setReason] = useState('');
  const scope = { projectId: task.projectId, taskId: task.id };
  const record = taskAutomation(state, scope), member = projectMembers(state, task.projectId).find(item => item.id === task.assigneeId);
  const nodeState = task.nodes[node];
  const preparation = record?.preparation;
  const nodeKnowledge = node === 'accept' ? undefined : taskNodeKnowledge(record, node);
  const awaitingKnowledge = !!nodeKnowledge && nodeKnowledge.status !== 'ready';
  const preparingNode = node === 'prepare' && !!preparation && nodeState.status === 'pending';
  const inputsRead=useTaskNodeInputs(task.projectId,task.id,node,!awaitingKnowledge);
  const view = taskNodeView(state, task, node, data,inputsRead.value);
  const events = (state.workspace.collaboration?.events ?? []).filter(event => event.projectId === task.projectId && event.taskId === task.id && event.nodeId === node);
  const adoptions = (state.workspace.collaboration?.adoptions ?? []).filter(item => item.projectId === task.projectId && item.taskId === task.id && item.nodeId === node);
  const result = events.filter(event => event.phase === 'result').reduce<(typeof events)[number] | undefined>((latest, event) => !latest || event.revision > latest.revision ? event : latest, undefined);
  const sessions = collectTaskSessions(state, scope).filter(session => node === 'accept' || session.nodeIds.includes(node));
  const snapshot = task.talentInputsSnapshot;
  const hasCurrentBasis = (id: RequirementNode) => [...(state.workspace.collaboration?.events ?? []), ...(state.workspace.collaboration?.adoptions ?? [])].some(item => item.projectId === task.projectId && item.taskId === task.id && item.nodeId === id) || id === 'accept' && task.checks.some(check => !!check.sessionId);
  const legacyNode = !!task.legacyBasis && !hasCurrentBasis(node);
  const knowledge=(inputsRead.value?.knowledge.assets??[]).map(asset=>({title:asset.title,version:asset.version??t('ov.severityUnset')}));
  const skills=(inputsRead.value?.skills??[]).map(skill=>({title:skill.name,version:skill.version}));
  const upNodes: RequirementNode[] = node === 'prepare' ? [] : node === 'develop' ? ['prepare'] : node === 'verify' ? ['develop'] : ['develop', 'verify'];
  const inputState=awaitingKnowledge ? knowledgeLabels[nodeKnowledge.status] : inputsRead.pending?t('lt.readingInputs'):inputsRead.error?t('flow.inputReadFailed'):inputsRead.value?.selection.status==='not-configured'?t('lt.inputNotConfigured'):inputsRead.value?.selection.basis==='adopted-node'?t('lt.inputAdopted'):inputsRead.value?.selection.basis==='historical-subset'?t('lt.inputHistorical'):t('lt.inputSuggested');
  const go = (id: string) => navigate('projects?' + new URLSearchParams({ project: task.projectId, tab: 'delivery', task: task.id, node: id }));
  const act = async (action: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await run(() => deliveryRequirementAction(state, role, { ...scope, action, reason }));
      if (saved) { receiveState(saved); setAccepting(false); setReturning(false); }
    } finally { setBusy(false); }
  };
  if (!taskVisibleTo(role, task.assigneeId)) return <Alert type="info" title={t('lt.outOfScope')} />;
  const detail = (title: string, content: string) => showText(task.title + ' · ' + title, content);
  const resultHint = node === 'prepare'
    ? task.preparedAt ? t('lt.hintAdopted') : preparationReady(preparation) ? t('lt.hintSessionRead') : t('lt.hintWaitingRead')
    : node === 'accept'
      ? task.stage === 'accepted' ? t('lt.hintAccepted') : task.stage === 'awaiting-acceptance' ? t('lt.hintAwaitingAcceptance') : task.stage === 'returned' ? t('lt.hintReturned') : t('lt.hintWaitingDevVerify')
      : result ? nodeState.status === 'complete' ? t('lt.hintResultReady') : t('lt.hintResultPartial') : t('lt.hintNoResult');
  const inputDetails = <div className="page-stack">
    <Typography.Paragraph className="task-node-fulltext">{task.description}</Typography.Paragraph>
    <p className="muted">{selectionNote(inputsRead.value?.selection)??t('lt.inputNotRead')}</p>
    <List size="small" header={t('lt.knowledgeVersions')} dataSource={[...knowledge.map(item => ({ ...item, kind: t('lt.knowledge') })), ...skills.map(item => ({ ...item, kind: 'Skill' }))]} locale={{ emptyText: t('lt.noVersions') }} renderItem={(item) => <List.Item><span>{item.kind} · {item.title}</span><Tag title={item.version}>{item.version}</Tag></List.Item>} />
    {inputsRead.value?.skills.length ? <Space wrap>{inputsRead.value.skills.map(skill => <Button size="small" key={skill.id} onClick={() => detail(skill.name + ' · ' + skill.version, skill.content)}>{t('lt.readSkill', { name: skill.name })}</Button>)}</Space> : null}
    <TaskKnowledgeSources key={task.projectId+':'+task.id+':'+node+':'+role} assets={inputsRead.value?.knowledge.assets??[]} />
    {upNodes.map(id => <div key={id}><strong>{deliveryNodeLabels[id]} · {statusLabels[task.nodes[id].status]}</strong><p className="task-node-fulltext">{task.nodes[id].summary || t('lt.noUpstream')}</p></div>)}
  </div>;
  const ownerName = projectMembers(state, task.projectId).find(item => item.role === 'owner')?.name ?? t('ov.unassigned');
  return <TaskDeliveryLayout projectId={task.projectId} taskId={task.id} title={task.title} owner={member?.name ?? t('ov.unassigned')} node={node} nodeOwner={node === 'accept' ? t('lt.confirmer', { name: ownerName }) : t('dts.assignee', { name: member?.name ?? t('ov.unassigned') })} contentKey={task.projectId + ':' + task.id + ':' + node + ':' + role}
    sidebar={<DeliveryTaskSidebar projectId={task.projectId} selectedTaskId={task.id} items={sidebarItems} />}
    flow={<TaskDeliveryFlow scope={scope} selected={node} onSelect={go} nodeInputs={inputsRead.value} nodes={(Object.keys(deliveryNodeLabels) as RequirementNode[]).map(id => ({ id, label: deliveryNodeLabels[id], role: id === 'accept' ? 'Owner' : member?.name ?? t('ov.unassigned'), description: '', statusTone: id === 'prepare' && preparation && task.nodes[id].status === 'pending' ? preparation.status === 'ready' && !preparationReady(preparation) ? 'processing' : preparationStatusTones[preparation.status] : nodeStatusTones[task.nodes[id].status], status: id === 'prepare' && preparation && task.nodes[id].status === 'pending' ? preparationStatusLabel(preparation) : task.nodes[id].status === 'complete' && task.legacyBasis && !hasCurrentBasis(id) ? t('lt.legacyComplete') : statusLabels[task.nodes[id].status], running: task.nodes[id].status === 'running' || id === 'prepare' && preparation?.status === 'preparing-session', complete: task.nodes[id].status === 'complete' && !(task.legacyBasis && !hasCurrentBasis(id)), summary: nodeArtifactSummary(taskNodeView(state, task, id, data)) }))} />}
    sections={{ input: { action: <Tag>{inputState}</Tag>, content: <>
          <p className="task-node-requirement">{awaitingKnowledge ? task.description : firstSentence(task.description)}</p>
          <RequirementConfirmations key={task.projectId + ':' + task.id + ':' + role} task={task} />
          {awaitingKnowledge ? <><p className="muted">{nodeKnowledge.status === 'waiting-upstream' ? node === 'develop' ? t('lt.knowledgeWaitingPrd') : t('lt.knowledgeWaitingDev') : nodeKnowledge.status === 'running' ? t('flow.importingNode') : nodeKnowledge.status === 'failed' ? t('lt.knowledgeFailure') : t('lt.knowledgeWaiting')}</p>{node !== 'prepare' && <TaskNodeArtifacts scope={{...scope,nodeId:node}} items={view.inputs.filter(item => item.references.some(reference => !!reference.sourceNode))} onSource={go} />}</> : <>
          {inputsRead.error&&<Alert type="warning" title={t('lt.talentInputFailed')} description={inputsRead.error} action={<Button onClick={inputsRead.refresh}>{t('lt.refetch')}</Button>}/>}
          {!inputsRead.pending&&<Space><span className="muted">{selectionNote(inputsRead.value?.selection)}</span><Button type="link" size="small" onClick={inputsRead.refresh}>{t('lt.refetchInputs')}</Button></Space>}
          <TaskNodeArtifacts scope={{...scope,nodeId:node}} items={view.inputs} onSource={go} />
          <div className="task-node-input-summary"><span>{t('lt.knowledgeCount', { count: knowledge.length })}</span><span>{t('lt.skillCount', { count: skills.length })}</span>{upNodes.map(id => <span key={id}>{t('lt.upstreamItem', { node: deliveryNodeLabels[id], status: statusLabels[task.nodes[id].status] })}</span>)}</div>
          {!task.assigneeId && <Alert type="info" title={t('lt.unassignedRequirement')} description={t('lt.unassignedHint')} action={<Button size="small" onClick={() => navigate('projects?' + new URLSearchParams({ project: task.projectId, tab: 'management', category: 'requirements', item: (task.projectId === 'carddemo' && task.id === 'DEMO-MKT-001' ? 'requirements:' : 'teams-task:') + task.projectId + ':' + task.id }))}>{t('lt.enterTaskManagement')}</Button>} />}
          <Collapse ghost size="small" items={[{ key: 'inputs', label: t('lt.viewInputs'), children: inputDetails }]} /></>}
        </> }, execution: { action: <Tag color={nodeState.status === 'complete' && !legacyNode ? 'green' : nodeState.status === 'blocked' ? 'orange' : undefined}>{preparingNode ? preparationStatusLabel(preparation!) : legacyNode && nodeState.status === 'complete' ? t('lt.legacyComplete') : statusLabels[nodeState.status]}</Tag>, content: <>
          <div className="task-node-execution-summary"><span>{stamp(preparingNode ? preparation?.updatedAt : nodeState.updatedAt)}</span><span>{t('lt.workReports', { count: events.length })}</span>{node === 'prepare' && preparation && <span>{t('lt.prepProgress', { count: preparation.progress.length })}</span>}{sessions.length > 0 && <span>{t('lt.linkedSessions', { count: sessions.length })}</span>}</div>
          <p>{preparingNode ? preparationHint(preparation!) : node === 'accept' ? t('lt.acceptByOwner') : nodeState.status === 'pending' ? t('lt.startFromTop') : nodeState.status === 'blocked' ? t('lt.blockedHint') : nodeState.status === 'complete' ? legacyNode ? t('lt.legacyHint') : t('lt.completedHint') : t('lt.runningHint')}</p>
          {legacyNode && <p className="muted">{t('lt.legacyRecord')}</p>}
          <section className="task-process-progress" aria-label={t('lt.progress')}><h3>{t('lt.progress')}</h3>{node === 'prepare' && <TaskPreparationProgress key={preparation?.id + ':' + role} scope={scope} />}<CollaborationProgress {...scope} nodeId={node} embedded /></section>
          <TaskSessionActivity key={task.id + ':' + node + ':' + role} {...scope} nodeId={node} />
          {(node === 'develop' || node === 'verify' || node === 'accept') && <Collapse ghost size="small" items={[{ key: 'session-links', label: t('lt.viewSessionLinks'), children: <TaskSessions key={task.id + ':' + node} scope={scope} node={node === 'accept' ? undefined : node} readonly={node === 'accept'} /> }]} />}
        </> }, result: { content: <>
          <p>{resultHint}</p>
          <h3 className="task-deliverables-heading">{t('lt.deliverables')}</h3><TaskNodeArtifacts scope={{...scope,nodeId:node}} items={view.deliverables} onSource={go} /><TaskCompletionCriteria view={view} />
          {node === 'prepare' && <Space wrap><Tag>{task.preparedAt ? t('lt.adoptionSaved') : t('lt.adoptionPending')}</Tag>{adoptions.length > 0 && <Button size="small" onClick={() => detail(t('lt.adoptionBasis'), JSON.stringify(adoptions, null, 2))}>{t('lt.viewAdoptionBasis')}</Button>}</Space>}
          {(node === 'develop' || node === 'verify') && <>
            <Space wrap><Tag>{t('lt.evidenceRefs', { count: result?.evidence.length ?? 0 })}</Tag>{result && <Button size="small" onClick={() => detail(t('lt.resultEvidence'), JSON.stringify(result, null, 2))}>{t('lt.viewEvidence')}</Button>}</Space>
            {node === 'verify' && <><p className="muted">{t('lt.checkHistory', { actual: task.checks.filter(check => check.source === 'actual').length, preset: task.checks.filter(check => check.source === 'preset').length })}</p><Collapse ghost size="small" items={[{ key: 'checks', label: t('lt.viewChecks', { count: task.checks.length }), children: <List size="small" dataSource={task.checks} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('lt.noChecks')} /> }} renderItem={check => <List.Item data-check-id={check.id} data-check-source={check.source}><div><Space wrap><Tag color={check.status === 'passed' ? 'green' : 'orange'}>{check.status === 'passed' ? t('lt.checkPassed') : t('lt.checkFailed')}</Tag><Tag>{check.source === 'actual' ? t('lt.checkActual') : t('lt.checkPreset')}</Tag><span className="muted">{stamp(check.at)}</span></Space><p className="task-node-fulltext">{check.summary}</p></div></List.Item>} /> }]} /><p className="muted">{t('lt.checksNote')}</p></>}
          </>}
          {node === 'accept' && <>
            {task.acceptedAt && <p className="muted">{t('lt.acceptedAt', { time: stamp(task.acceptedAt) })}</p>}
            {task.stage === 'returned' && task.nodes.accept.summary && <Button size="small" onClick={() => detail(t('lt.returnNote'), task.nodes.accept.summary)}>{t('lt.viewReturnNote')}</Button>}
            {role === 'owner' && task.stage === 'awaiting-acceptance' && <Space wrap><Button type="primary" onClick={() => setAccepting(true)}>{t('lt.acceptRequirement')}</Button><Button onClick={() => setReturning(true)}>{t('lt.returnForMore')}</Button></Space>}
            {task.stage === 'accepted' && <p className="muted">{record?.collection?.reporting?.status === 'reported' ? record.collection.reporting.receipt?.id.startsWith('SHARED-') ? t('lt.colShared') : record.collection.reporting.receipt?.id.startsWith('TALENT-INBOX-') ? t('lt.colTalent') : t('lt.colReceipt') : record?.collection?.reporting?.status === 'failed' ? t('lt.colFailed') : t('lt.colPending')}</p>}
          </>}
        </> } }}
    materials={<>      <h4>{t('lt.materialDescription')}</h4>
      <div className="task-material-description">{task.description.split(/(?<=。)|\n/).filter(part => part.trim()).map((part, index) => <p key={index}>{part.trim()}</p>)}</div>
      <h4>{t('lt.acceptanceCriteria')}</h4>
      <p className="muted">{task.confirmations?.length ? t('lt.criteriaRegistered', { count: task.confirmations.length }) : t('lt.criteriaMissing')}</p>
      {task.legacyBasis && <><p className="muted">{t('lt.legacyBasisNote')}</p><Button type="link" size="small" onClick={() => detail(t('lt.legacyBasis'), JSON.stringify(task.legacyBasis, null, 2))}>{t('lt.viewLegacyBasis')}</Button></>}
</>}
  >
    <Modal title={t('lt.acceptTitle')} open={accepting} onCancel={() => setAccepting(false)} confirmLoading={busy} okButtonProps={{ 'aria-label': t('lt.acceptAria'), disabled: busy }} cancelButtonProps={{ disabled: busy }} onOk={() => void act('accept')}><p>{task.title}</p><p>{t('lt.acceptBody')}</p></Modal>
    <Modal title={t('lt.returnForMore')} open={returning} onCancel={() => setReturning(false)} confirmLoading={busy} okButtonProps={{ disabled: busy || !reason.trim() }} onOk={() => void act('return')}><Input.TextArea value={reason} onChange={event => setReason(event.target.value)} placeholder={t('lt.returnPlaceholder')} /></Modal>
  </TaskDeliveryLayout>;
}
