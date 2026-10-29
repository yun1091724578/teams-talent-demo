import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Drawer, Empty, Space, Spin, Tag } from 'antd';
import { getTaskArtifactContent } from '../api.js';
import { currentT } from '../../../shared/i18n/index.js';
import { labelText } from '../task-labels-en.js';
import type { TaskArtifactContent } from '../task-artifact-content.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { taskNodeDefinitions, type TaskNodeItem, type TaskNodeReference, type TaskNodeView } from '../task-node-contract.js';
import type { RequirementNode } from '../delivery-requirements.js';
import './task-node-artifacts.css';

const statusKeys = { ready: 'art.ready', missing: 'art.missing', unregistered: 'art.unregistered' } as const;
const kindKeys = { reference: 'art.kindReference', 'local-file': 'art.kindLocalFile', record: 'art.kindRecord' } as const;
// Deliverable names come from the domain contract; only the kind fallback is chrome.
const artifactLabel = (reference: TaskNodeReference) => {
  const found = Object.values(taskNodeDefinitions).flatMap(node => node.deliverableRequirements).find(item => item.artifact === reference.artifact)?.label;
  return found ? labelText(found) : currentT(kindKeys[reference.kind]);
};
export function TaskNodeArtifacts({ items, onSource, scope }: { items: TaskNodeItem[]; onSource(node: RequirementNode): void; scope?:{projectId:string;taskId:string;nodeId:RequirementNode} }) {
  const { showText,role } = useDemo();
  const t = useT();
  const [selected,setSelected]=useState<TaskNodeReference|null>(null),[body,setBody]=useState<TaskArtifactContent|null>(null),[error,setError]=useState('');
  const [selectionScope,setSelectionScope]=useState('');
  const request=useRef(0),scopeKey=JSON.stringify([role,scope?.projectId,scope?.taskId,scope?.nodeId]);
  const activeScope=useRef(scopeKey);activeScope.current=scopeKey;
  useEffect(()=>{request.current++;setSelected(null);setBody(null);setError('');return()=>{request.current++;};},[scopeKey]);

  const details = (reference: TaskNodeReference) => [reference.title, '', t('art.type', { value: artifactLabel(reference) }), t('art.source', { value: labelText(reference.sourceLabel) }), t('art.version', { value: reference.version ?? t('art.unregistered') }), ...(reference.codeVersion ? [t('art.codeVersion', { value: reference.codeVersion })] : []), ...(reference.value ? [t('art.reference', { value: reference.value })] : []), '', reference.description, ...(reference.execution ? ['', t('art.unitTestDeclaration'), t('art.requiredScopes', { value: reference.execution.requiredScopes.join(t('common.listSeparator')) }), t('art.notRunScopes', { value: reference.execution.notRunScopes.join(t('common.listSeparator')) || t('art.none') }), ...reference.execution.runs.flatMap(run => ['', t('art.scope', { value: run.scope }), t('art.command', { value: run.command }), t('art.statusWithExit', { status: run.status, code: run.exitCode ?? t('art.notExecuted') }), t('art.counts', { passed: run.passed, failed: run.failed, skipped: run.skipped }), t('art.executedAt', { value: run.executedAt ?? t('art.unregistered') }), ...(run.excludedSkips ? [t('art.excludedSkips', { count: run.excludedSkips.count, reason: run.excludedSkips.reason })] : [])])] : reference.artifact === 'unit-test-result' ? ['', t('art.legacyReport')] : [])].join('\n');
  const open = (reference: TaskNodeReference) => {
    if(!scope||!reference.id.startsWith('artifact:')||!reference.sourceNode){showText(reference.title, details(reference));return;}
    const id=++request.current,key=scopeKey;setSelectionScope(key);setSelected(reference);setBody(null);setError('');
    void getTaskArtifactContent(role,{projectId:scope.projectId,taskId:scope.taskId,nodeId:reference.sourceNode,artifactId:reference.id,version:reference.version??''}).then(value=>{if(request.current===id&&activeScope.current===key)setBody(value);}).catch(reason=>{if(request.current===id&&activeScope.current===key)setError((reason as Error).message);});
  };

  return <><div className="task-artifact-grid">{items.map(item => <section className="task-artifact-group" key={item.id} data-artifact-slot={item.id} data-artifact-status={item.status}>
    <div className="task-artifact-heading"><strong>{labelText(item.label)}</strong><Tag>{t(statusKeys[item.status])}</Tag></div>
    {item.references.length ? item.references.slice(0, 2).map(reference => <div className="task-artifact-reference" key={reference.id} data-artifact-reference={reference.id}>
      <span className="task-artifact-name" title={reference.title}>{reference.title}</span>
      <p className="task-artifact-meta" title={labelText(reference.sourceLabel) + ' · ' + (reference.version ?? t('art.unknownVersion'))}>{labelText(reference.sourceLabel)}{reference.version ? ' · ' + reference.version : ' ' + t('art.versionUnregistered')}</p>
      {reference.codeVersion && <p className="task-artifact-meta" title={reference.codeVersion}>{t('art.codeVersionLabel', { value: reference.codeVersion })}</p>}
      <Space size={8} wrap><Button type="link" size="small" onClick={() => open(reference)}>{t('art.viewReference')}</Button>{reference.sourceNode && <Button type="link" size="small" onClick={() => onSource(reference.sourceNode!)}>{t('art.fromSource', { label: labelText(taskNodeDefinitions[reference.sourceNode].label) })}</Button>}</Space>
    </div>) : <p className="task-artifact-missing">{item.id === 'confirmations' ? t('art.noConfirmations') : item.status === 'unregistered' ? t('art.notRegistered') : t('art.awaitingSubmit')}</p>}
    {item.references.length > 2 && <Button type="link" size="small" className="task-artifact-more" onClick={() => showText(t('art.allReferences', { label: labelText(item.label) }), item.references.map(details).join('\n\n'))}>{t('art.viewAllReferences', { count: item.references.length })}</Button>}
  </section>)}</div><Drawer open={!!selected&&selectionScope===scopeKey} onClose={()=>{request.current++;setSelected(null);}} title={selected?artifactLabel(selected):undefined} width={880} destroyOnHidden>
    <div data-task-artifact-viewer={selected?.id} data-artifact-task={scope?.taskId}>
      {selected?.version&&<p>{t('art.version', { value: selected.version })}</p>}
      {error?<Alert type="error" showIcon title={t('art.readFailed')} description={error}/>:body?body.kind==='link'?<Button type="link" href={body.url} target="_blank" rel="noopener noreferrer">{t('art.openGithub')}</Button>:<pre className="task-node-fulltext" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{body.content}</pre>:<Spin size="small"/>}
      {body&&<Collapse size="small" items={[{key:'metadata',label:t('art.metadata'),children:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{[selected?details(selected):'',body.note,body.sha256?t('art.sha256', { hash: body.sha256 }):''].filter(Boolean).join('\n\n')}</pre>}]}/>}
    </div>
  </Drawer></>;
}
export function TaskCompletionCriteria({ view }: { view: TaskNodeView }) {
  const { showText } = useDemo();
  const t = useT();
  return <section className="task-completion-criteria"><h3>{t('art.completionCriteria')}</h3>{view.criteria.length ? view.criteria.map(item => <div key={item.id} data-completion-criterion={item.id} data-criterion-status={item.status}>
    <div><Tag>{item.status === 'reported' ? view.definition.id === 'accept' ? t('art.ownerConfirmed') : t('art.memberReported') : item.status === 'unregistered' ? t('art.evidenceMissing') : t('art.toComplete')}</Tag><span>{labelText(item.label)}</span></div>
    {item.evidenceIds.length > 0 && <Button type="link" size="small" onClick={() => showText(labelText(item.label) + ' · ' + t('art.viewCriterionEvidence'), JSON.stringify({ criterion: item, references: [...view.artifacts, ...view.deliverables.flatMap(slot => slot.references)].filter(reference => item.evidenceIds.includes(reference.id)) }, null, 2))}>{t('art.viewCriterionEvidence')}</Button>}
  </div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('art.noCriteria')} />}<p className="muted">{t('art.criteriaNote')}</p></section>;
}
export function nodeArtifactSummary(view: TaskNodeView) {
  const displayed = view.deliverables.filter(item => view.definition.deliverableRequirements.some(required => required.id === item.id));
  return currentT('art.summary', { ready: displayed.filter(item => item.status === 'ready').length, total: displayed.length });
}
