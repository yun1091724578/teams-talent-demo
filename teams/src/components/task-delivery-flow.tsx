import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, List, Tag } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { selectionNote } from '../display-text.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { triggerTaskAutomation } from '../api.js';
import { deliveryRequirement } from '../delivery-requirements.js';
import { taskAutomation, taskNodeKnowledge, collectTaskSessions, type TaskScope, type KnowledgeImport, type TaskAutomation } from '../task-automation.js';
import { taskExecutableBy } from '../task-visibility.js';
import type { TalentNodeInputs } from '../talent-node-inputs.js';
import { useTaskNodeInputs } from './use-task-node-inputs.js';
import '../task-delivery-flow.css';

export type FlowStatusTone = 'default' | 'processing' | 'success' | 'warning' | 'error';
const statusTagColors: Record<FlowStatusTone, string> = { default: 'default', processing: 'blue', success: 'green', warning: 'orange', error: 'red' };
export const nodeStatusTones = { pending: 'default', running: 'processing', blocked: 'error', complete: 'success', 'waiting-owner': 'warning' } as const;
export const preparationStatusTones: Record<NonNullable<TaskAutomation['preparation']>['status'], FlowStatusTone> = { queued: 'default', importing: 'processing', 'preparing-session': 'processing', ready: 'success', 'waiting-directory': 'default', failed: 'error' };
export const importedStatusTones: Record<string, FlowStatusTone> = { '已确认': 'success', '已提交': 'success', '已形成场景': 'success', '已完成': 'success', '待 C 评审': 'warning', '待 A 确认': 'warning', '未开始': 'default', '未执行': 'default', '未提交': 'default', '仅有测试准备': 'default', '来源未提供': 'default' };
export interface FlowNode { id: string; label: string; role: string; description: string; status: string; statusTone?: FlowStatusTone; complete?: boolean; running?: boolean; summary?: string }
const knowledgeNodeIds = ['prepare', 'develop', 'verify'] as const;
type KnowledgeNode = typeof knowledgeNodeIds[number];
const knowledgeNodeKeys: Record<KnowledgeNode, { label: MessageKey; trigger: MessageKey }> = {
  prepare: { label: 'flow.knowledgePrepare', trigger: 'flow.triggerPrepare' },
  develop: { label: 'flow.knowledgeDevelop', trigger: 'flow.triggerDevelop' },
  verify: { label: 'flow.knowledgeVerify', trigger: 'flow.triggerVerify' },
};
const knowledgeKeys: Record<KnowledgeImport['status'], MessageKey> = { 'waiting-upstream': 'flow.kWaitingUpstream', queued: 'flow.kQueued', running: 'flow.kRunning', ready: 'flow.kReady', waiting: 'flow.kWaiting', failed: 'flow.kFailed' };
// Getters keep `knowledgeLabels[status]` working for callers while reading the ambient locale.
export const knowledgeLabels: Record<KnowledgeImport['status'], string> = Object.defineProperties({} as Record<KnowledgeImport['status'], string>, Object.fromEntries(
  (Object.keys(knowledgeKeys) as KnowledgeImport['status'][]).map(status => [status, { get: () => currentT(knowledgeKeys[status]), enumerable: true }]),
));
const knowledgeStatusTones: Record<KnowledgeImport['status'], FlowStatusTone> = { 'waiting-upstream': 'default', queued: 'default', running: 'processing', ready: 'success', waiting: 'default', failed: 'error' };
const collectionKeys = { queued: 'flow.cQueued', running: 'flow.cRunning', collected: 'flow.cCollected', empty: 'flow.cEmpty', failed: 'flow.cFailed' } as const;

export function TaskDeliveryFlow({ scope, nodes, selected, onSelect, readonly = false, showAutomation = true, ariaPrefix, nodeInputs }: { nodeInputs?: TalentNodeInputs; scope: TaskScope; nodes: FlowNode[]; selected: string; onSelect(id: string): void; readonly?: boolean; showAutomation?: boolean; ariaPrefix?: string }) {
  const { state, role, receiveState } = useDemo();
  const t = useT();
  const nodePrefix = ariaPrefix ?? t('flow.nodePrefix');
  const [detail, setDetail] = useState<KnowledgeNode | 'collection' | null>(null), [pending, setPending] = useState(false), [error, setError] = useState('');
  const record = taskAutomation(state, scope), task = deliveryRequirement(state, scope.projectId, scope.taskId), inFlight = useRef(false);
  const scopeKey = [scope.projectId, scope.taskId, role].join('/'), activeScope = useRef(scopeKey); activeScope.current = scopeKey;
  const canRetry = !readonly && !!task && (role === 'owner' || taskExecutableBy(role, task.assigneeId));
  useEffect(() => { setDetail(null); setError(''); }, [scopeKey]);
  const trigger = async (step: 'collection' | 'node-knowledge', nodeId?: KnowledgeNode) => {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(''); const key = scopeKey;
    try { receiveState(await triggerTaskAutomation(role, scope, step, true, nodeId)); }
    catch (cause) { if (activeScope.current === key) setError((cause as Error).message); }
    finally { inFlight.current = false; if (activeScope.current === key) setPending(false); }
  };
  // Reading knowledge never schedules an import. Retain accepted-task collection.
  useEffect(() => { if (!readonly && role === 'owner' && record?.collection?.status === 'queued') void trigger('collection'); }, [readonly, role, record?.collection?.status, scope.projectId, scope.taskId]);
  const detailNode = detail && detail !== 'collection' ? detail : 'prepare';
  const detailKnowledge = taskNodeKnowledge(record, detailNode);
  const detailRead = useTaskNodeInputs(scope.projectId, scope.taskId, detailNode, !!detail && detail !== 'collection' && (!detailKnowledge || detailKnowledge.status === 'ready'));
  const detailInputs = detailKnowledge?.status === 'ready' ? detailKnowledge.nodeInputs ?? detailRead.value : !detailKnowledge ? detailRead.value ?? (nodeInputs?.nodeId === detailNode ? nodeInputs : undefined) : undefined;
  const knowledgeStatus = (id: KnowledgeNode) => { const item = taskNodeKnowledge(record, id); return item ? t(knowledgeKeys[item.status]) : readonly ? t('flow.readonlySource') : t('flow.noKnowledgeRecord'); };
  const collection = record?.collection, receiptId = collection?.reporting?.receipt?.id ?? '';
  const receiptStatus = receiptId.startsWith('SHARED-') ? t('flow.receiptShared') : receiptId.startsWith('TALENT-INBOX-') ? t('flow.receiptTalent') : t('flow.receiptObtained');
  const collectionStatus = collection?.reporting?.status === 'reported' ? t('flow.repReported') : collection?.reporting?.status === 'uploading' ? t('flow.repUploading') : collection?.reporting?.status === 'failed' ? t('flow.repFailed') : collection ? t(collectionKeys[collection.status]) : t('flow.repWaitingAcceptance');
  const collectionTone: FlowStatusTone = readonly ? 'default' : collection?.reporting?.status === 'reported' ? 'success' : collection?.reporting?.status === 'uploading' ? 'processing' : collection?.reporting?.status === 'failed' || collection?.status === 'failed' ? 'error' : collection?.status === 'running' ? 'processing' : collection?.status === 'collected' ? 'success' : 'default';
  const collectionRunning = collection?.status === 'running' || collection?.reporting?.status === 'uploading';
  const sessions = collection?.sessions ?? collectTaskSessions(state, scope);
  const flow = useRef<HTMLDivElement>(null), refs = useRef(new Map<string, HTMLButtonElement>()), marker = useId().replace(/\W/g, '');
  const [lines, setLines] = useState<{ id: string; d: string; layer: 'main' | 'talent'; running: boolean }[]>([]);
  const statusKey = nodes.map(node => node.id + ':' + node.running).join(',') + knowledgeNodeIds.map(id => ':' + taskNodeKnowledge(record, id)?.status).join('') + ':' + collectionRunning;
  useEffect(() => {
    const root = flow.current; if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect(), rect = (id: string) => refs.current.get(id)?.getBoundingClientRect();
      const line = (id: string, x1: number, y1: number, x2: number, y2: number, layer: 'main' | 'talent', running = false) => ({ id, layer, running, d: 'M ' + (x1-base.left) + ' ' + (y1-base.top) + ' L ' + (x2-base.left) + ' ' + (y2-base.top) });
      const output: typeof lines = [];
      nodes.slice(1).forEach((node, index) => { const a = rect(nodes[index].id), b = rect(node.id); if (a && b) output.push(line(nodes[index].id + '-' + node.id, a.right + 2, a.y + a.height / 2, b.left - 4, b.y + b.height / 2, 'main', !!node.running)); });
      if (showAutomation) {
        knowledgeNodeIds.forEach(id => { const a = rect('knowledge-' + id), b = rect(id); if (a && b) output.push(line('knowledge-' + id, a.x + a.width / 2, a.top - 2, b.x + b.width / 2, b.bottom + 4, 'talent', taskNodeKnowledge(record, id)?.status === 'running')); });
        const a = rect('accept'), b = rect('auto-collection'); if (a && b) output.push(line('accept-collection', a.x + a.width / 2, a.bottom + 2, b.x + b.width / 2, b.top - 4, 'talent', collectionRunning));
      }
      setLines(output);
    };
    const observer = new ResizeObserver(measure); observer.observe(root); for (const element of refs.current.values()) observer.observe(element); measure();
    return () => observer.disconnect();
  }, [statusKey, showAutomation, scopeKey]);
  const bind = (id: string) => (element: HTMLButtonElement | null) => { if (element) refs.current.set(id, element); else refs.current.delete(id); };
  const detailLabel = detail && detail !== 'collection' ? t(knowledgeNodeKeys[detail].label) : t('flow.dataCollection');
  return <div className="task-delivery-flow" data-flow-task={scope.taskId}>
    <div ref={flow} className={'task-flow-grid' + (!showAutomation ? ' no-automation' : '')} style={{ '--flow-count': nodes.length } as CSSProperties}>
      <div className="task-main-rail" aria-label={t('flow.mainRail')}>{nodes.map(node => <Button key={node.id} htmlType="button" ref={bind(node.id)} data-flow-node={node.id} data-running={!!node.running} aria-label={nodePrefix + node.label} aria-current={selected === node.id ? 'step' : undefined} aria-pressed={selected === node.id} className={'task-flow-card' + (selected === node.id ? ' selected' : '') + (node.running ? ' is-running' : '')} onClick={() => onSelect(node.id)}><strong>{node.label}</strong><span className="task-flow-status"><Tag data-status-tone={node.statusTone ?? 'default'} color={statusTagColors[node.statusTone ?? 'default']}>{node.running && <LoadingOutlined className="flow-progress-icon" spin />} {node.status}</Tag></span><small>{node.role} · {node.summary ?? (readonly ? t('flow.originalRecord') : node.complete ? t('flow.hasOutput') : t('flow.noOutput'))}</small></Button>)}</div>
      {showAutomation && <section className="task-talent-rail" aria-label={t('flow.talentRail')}><div className="task-talent-title"><span>Talent</span><small>{t('flow.talentNote')}</small></div>
        {knowledgeNodeIds.map(id => { const label = t(knowledgeNodeKeys[id].label), item = taskNodeKnowledge(record, id), running = item?.status === 'running'; return <Button key={id} htmlType="button" ref={bind('knowledge-' + id)} data-flow-node={'knowledge-' + id} data-knowledge-state={item?.status ?? 'unrecorded'} data-running={running} className={'task-flow-card task-auto-card' + (running ? ' is-running' : '')} aria-label={t('flow.nodeDetail', { label })} onClick={() => setDetail(id)}><strong>{label}</strong><span className="task-flow-status"><Tag data-status-tone={item ? knowledgeStatusTones[item.status] : 'default'} color={statusTagColors[item ? knowledgeStatusTones[item.status] : 'default']}>{running && <LoadingOutlined className="flow-progress-icon" spin />} {knowledgeStatus(id)}</Tag></span><small>{t(knowledgeNodeKeys[id].trigger)}</small></Button>; })}
        <Button htmlType="button" ref={bind('auto-collection')} data-flow-node="auto-collection" data-running={collectionRunning} className={'task-flow-card task-auto-card' + (collectionRunning ? ' is-running' : '')} aria-label={t('flow.collectionDetail')} onClick={() => setDetail('collection')}><strong>{t('flow.dataCollection')}</strong><span className="task-flow-status"><Tag data-status-tone={collectionTone} color={statusTagColors[collectionTone]}>{collectionRunning && <LoadingOutlined className="flow-progress-icon" spin />} {readonly ? t('flow.readonlySource') : collectionStatus}</Tag></span><small>{t('flow.autoCollectNote')}</small></Button>
      </section>}
      <svg className="task-flow-connectors" aria-hidden="true"><defs>{(['main', 'talent'] as const).map(layer => <marker key={layer} id={marker + layer} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill={'var(--flow-' + layer + ')'} /></marker>)}</defs>{lines.map(line => <path key={line.id} data-connection={line.id} className={line.running ? 'is-running' : undefined} d={line.d} fill="none" stroke={'var(--flow-' + line.layer + ')'} strokeWidth="2" markerEnd={'url(#' + marker + line.layer + ')'} />)}</svg>
    </div>
    {error && <Alert type="error" title={t('flow.autoStepFailed')} description={error} />}
    <Drawer title={detailLabel} width={650} open={!!detail} onClose={() => setDetail(null)} destroyOnHidden>
      {detail && detail !== 'collection' ? <div className="page-stack"><Tag color={statusTagColors[detailKnowledge ? knowledgeStatusTones[detailKnowledge.status] : 'default']}>{knowledgeStatus(detail)}</Tag><p>{t('flow.noManualStart', { trigger: t(knowledgeNodeKeys[detail].trigger) })}</p>
        {detailKnowledge && <p className="muted">{t('flow.lastUpdated', { time: new Date(detailKnowledge.finishedAt ?? detailKnowledge.startedAt).toLocaleString('zh-CN') })}</p>}
        {detailKnowledge?.status === 'waiting-upstream' && <p>{detail === 'develop' ? t('flow.waitingPrd') : t('flow.waitingDevResult')}</p>}
        {detailKnowledge?.status === 'running' && <p>{t('flow.importingNode')}</p>}
        {detailKnowledge?.error && <Alert type="error" title={t('flow.knowledgeFailed')} description={detailKnowledge.error} />}
        {detailRead.error && <Alert type="warning" title={t('flow.inputReadFailed')} description={detailRead.error} />}
        {detailInputs ? <><p>{selectionNote(detailInputs.selection)}</p><List size="small" header={t('flow.nodeKnowledge')} dataSource={detailInputs.knowledge.assets} locale={{ emptyText: t('flow.noNodeKnowledge') }} renderItem={item => <List.Item>{item.title} · {item.version}</List.Item>} /><List size="small" header={t('flow.nodeSkills')} dataSource={detailInputs.skills} locale={{ emptyText: t('flow.noNodeSkills') }} renderItem={item => <List.Item>{item.name} · {item.version}</List.Item>} /><p className="muted">{t('flow.knowledgeNotAdoption')}</p></> : !detailKnowledge && <p className="muted">{t('flow.noAutoRecord')}</p>}
        {canRetry && detailKnowledge?.status === 'failed' && <Button loading={pending} onClick={() => void trigger('node-knowledge', detail)}>{t('flow.retryKnowledge')}</Button>}
      </div> : <div className="page-stack">
        <p>{t('flow.collectionIntro')}</p>
        <Descriptions column={1} size="small" items={[{ key: 'status', label: t('flow.colStatus'), children: readonly ? t('flow.readonlySource') : collectionStatus }, { key: 'count', label: t('flow.colCount'), children: collection?.sessions.length ?? 0 }, { key: 'time', label: t('flow.colTime'), children: collection?.finishedAt ?? '—' }, { key: 'upload', label: t('flow.colUpload'), children: collection?.reporting?.status === 'reported' ? receiptStatus : collection?.reporting?.reason ?? t('flow.notSharedYet') }]} />
        {collection?.error && <Alert type="error" title={t('flow.collectionFailed')} description={collection.error} />}
        <List size="small" dataSource={sessions} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('flow.noSessions')} /> }} renderItem={item => <List.Item><div><strong>{item.tool} · {item.sessionId}</strong><p className="muted">{t('flow.sourceNodes', { nodes: item.nodeIds.join(t('common.listSeparator')), sources: item.sources.join(t('common.listSeparator')) })}</p><small>{item.firstAt} — {item.lastAt}</small></div></List.Item>} />
        {collection?.reporting?.status === 'failed' && <Alert type="error" title={t('flow.shareFailed')} description={collection.reporting.reason} />}<p className="muted">{t('flow.shareReceiptNote')}</p>{collection?.reporting?.receipt && <pre className="task-collection-receipt">{JSON.stringify(collection.reporting.receipt, null, 2)}</pre>}
        {role === 'owner' && collection && (['failed', 'running'].includes(collection.status) || collection.reporting?.status === 'failed' || collection.reporting?.status === 'pending') && <Button loading={pending} onClick={() => void trigger('collection')}>{t('flow.retryCollection')}</Button>}
      </div>}
    </Drawer>
  </div>;
}
