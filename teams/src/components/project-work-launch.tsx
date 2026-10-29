import { taskAutomation, taskNodeKnowledge, type TaskPreparation } from '../task-automation.js';
import { preparationHint, preparationReady } from './task-preparation-progress.js';
import { displayText, displayRequirementId } from '../display-text.js';
import { useEffect, useRef, useState } from 'react';
import { message, Alert, Button, Checkbox, Collapse, Descriptions, Input, Modal, Radio, Space, Spin, Tooltip, Typography } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT } from '../../../shared/i18n/index.js';
import { bindProjectWork, getProjectWork, startProjectWork, triggerTaskAutomation } from '../api.js';
import type { ProjectWorkAction, ProjectWorkPlan, ProjectWorkReceipt, ProjectWorkSelection } from '../project-work.js';
import { ConfirmWork } from '../vendor/teams/work/confirm-work.js';
import { projectDeliveryTasks } from '../project-delivery-tasks.js';
import { projectTasksVisibleTo, taskExecutableBy } from '../task-visibility.js';
import './project-work-launch.css';

const requestPending = (receipt?: ProjectWorkReceipt) => receipt?.status === 'uncertain' || receipt?.status === 'prepared';
const requestTime = (value: string) => {
  const at = new Date(value);
  return Number.isNaN(at.valueOf()) ? currentT('wl.timeUnverified') : at.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
};

function WorkResult({ plan, receipt, done, newWork, inspect, check, prepared = false }: {
  prepared?: boolean; plan: ProjectWorkPlan; receipt: ProjectWorkReceipt; done: () => void; newWork: () => void; inspect: () => void; check: () => void;
}) {
  const t = useT();
  const pending = requestPending(receipt);
  const focused = receipt.status === 'terminal-focused';
  const history = receipt.sessionId && plan.history?.sessionId === receipt.sessionId ? plan.history : undefined;
  const terminal = receipt.terminal ?? (focused ? history?.active?.application : undefined);
  const nextStep = pending ? t('wl.nextPending')
    : prepared ? t('wl.nextPrepared')
    : focused ? t('wl.nextFocused')
      : receipt.executionMode === 'task-file' ? t('wl.nextTaskFile')
        : plan.target.taskId ? t('wl.nextWithTask') : t('wl.nextProject');
  return <div className="project-work-result">
    <Alert className="project-work-result-status" showIcon type={pending ? 'warning' : 'success'} title={pending ? t('wl.resultPending') : focused ? t('wl.resultFocused') : t('wl.resultSubmitted')} />
    <div className="project-work-result-summary">
      <Typography.Text strong>{displayText(plan.title)}</Typography.Text>
      <span className="muted">{plan.projectName} · {plan.location}</span>
      {(history?.title || terminal) && <Descriptions column={1} size="small" items={[
        ...(history?.title ? [{ key: 'session-name', label: t('wl.session'), children: history.title }] : []),
        ...(terminal ? [{ key: 'terminal', label: t('wl.terminal'), children: terminal }] : []),
      ]} />}
    </div>
    <p className="project-work-next-step">{nextStep}</p>
    <Collapse className="project-work-details" ghost items={[{ key: 'technical', label: t('wl.technical'), children: <div className="project-work-detail-content">
      <Descriptions column={1} size="small" items={[
        { key: 'request', label: t('wl.requestId'), children: receipt.requestId },
        { key: 'at', label: t('wl.recordedAt'), children: receipt.at },
        { key: 'session', label: t('wl.sessionId'), children: receipt.sessionId ?? t('wl.sessionPending') },
        { key: 'directory', label: t('wl.directory'), children: receipt.directory },
        { key: 'context', label: t('wl.contextFile'), children: receipt.contextPath },
      ]} />
      <p className="muted">{displayText(receipt.note)}</p>
      <Typography.Paragraph className="project-work-instruction" copyable={{ text: receipt.instruction, tooltips: [t('wl.copyInstruction'), t('wl.copied')] }}>{receipt.instruction}</Typography.Paragraph>
      <Button type="link" onClick={inspect}>{t('wl.viewRequest')}</Button>
    </div> }]} />
    <Space wrap><Button type="primary" aria-label={t('wl.close')} onClick={done}>{t('wl.close')}</Button>{pending ? <Button onClick={check}>{t('wl.recheck')}</Button> : plan.actions.some(item => item.id === 'new' && item.enabled) ? <Button onClick={newWork}>{t('wl.startNewWork')}</Button> : null}</Space>
  </div>;
}

export function ProjectWorkLaunch({ target }: { target: ProjectWorkSelection }) {
  const { role } = useDemo();
  return <ScopedProjectWorkLaunch key={JSON.stringify([role, target])} target={target} />;
}

function ScopedProjectWorkLaunch({ target }: { target: ProjectWorkSelection }) {
  const { state, data, role } = useDemo();
  const t = useT();
  const [open, setOpen] = useState<'prepare' | 'work' | 'ready' | null>(null), [configuring, setConfiguring] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string>();
  const [feedback, feedbackContext] = message.useMessage();
  const taskId = target.taskId ?? target.requirementId;
  const task = taskId ? projectDeliveryTasks(state, target.projectId, role).find(item => item.id === taskId) : undefined;
  const sourceTask = target.projectId === 'teams' ? data.teamsProject.tasks.find(item => item.id === taskId) : undefined;
  const automation = taskId ? taskAutomation(state, { projectId: target.projectId, taskId }) : undefined;
  const preparation = automation?.preparation;
  const nodeKnowledge = target.nodeId === 'prepare' || target.nodeId === 'develop' || target.nodeId === 'verify' ? taskNodeKnowledge(automation, target.nodeId) : undefined;
  const knowledgeReason = nodeKnowledge && nodeKnowledge.status !== 'ready' ? nodeKnowledge.status === 'waiting-upstream' ? t('wl.knowledgeWaitingUpstream') : nodeKnowledge.status === 'failed' ? t('wl.knowledgeFailed') : t('wl.knowledgeWaiting') : undefined;
  const preparationReason = preparation && !preparationReady(preparation) ? preparationHint(preparation) : undefined;
  const canConfigure = !!task && taskExecutableBy(role, task.assigneeId) && preparation?.status === 'waiting-directory';
  const permissionReason = !projectTasksVisibleTo(state, target.projectId, role) ? t('wl.outOfScope') : !taskId ? undefined : task ? taskExecutableBy(role, task.assigneeId) ? undefined : task.assigneeId ? t('wl.assignedTo', { name: task.owner }) : t('wl.notAssigned') : sourceTask ? t('wl.sourceAssignedTo', { name: sourceTask.owner }) : t('wl.taskMissing');
  const pristine = !!task?.record && task.record.stage === 'preparing' && !task.record.preparedAt && !task.record.nodeInputSnapshots?.prepare && Object.values(task.record.nodes).every(node => node.status === 'pending');
  const needsPreparation = target.nodeId === 'prepare' && (preparation ? !preparationReady(preparation) : pristine && nodeKnowledge?.status !== 'ready');
  const disabledReason = permissionReason ?? (needsPreparation ? undefined : preparationReason ?? knowledgeReason);
  useEffect(() => {
    if (!waitingFor) return;
    if (permissionReason || preparation?.id !== waitingFor) { setWaitingFor(undefined); return; }
    if (preparationReady(preparation)) { setWaitingFor(undefined); setConfiguring(false); setOpen('ready'); }
  }, [waitingFor, permissionReason, preparation]);
  const waitForPreparation = (id: string) => { setWaitingFor(id); setOpen(null); };
  // Each opening owns its asynchronous state. Closing or changing scope unmounts
  // it, so late bind/start callbacks cannot update another task or dialog instance.
  return <>{feedbackContext}<Tooltip title={disabledReason} trigger={['hover', 'focus']}><span className="project-work-entrance" tabIndex={disabledReason ? 0 : undefined} aria-label={disabledReason} title={disabledReason}><Button type="primary" icon={<CodeOutlined />} aria-label={t('wl.workEntry')} disabled={!!disabledReason} onClick={() => setOpen(needsPreparation ? 'prepare' : 'work')}>{t('wl.workEntry')}</Button></span></Tooltip>
    {canConfigure && <Button size="small" onClick={() => setConfiguring(true)}>{t('wl.configureDirectory')}</Button>}
    {waitingFor && <Button type="link" size="small" onClick={() => setWaitingFor(undefined)}>{t('wl.cancelReadyNotice')}</Button>}
    {configuring && !permissionReason && <ProjectWorkDialog target={target} close={() => setConfiguring(false)} configureOnly preparationRequested={waitForPreparation} />}
    {open === 'prepare' && !permissionReason && <PreparationConfirmation target={target} title={task?.title ?? ''} preparation={preparation} alreadyRequested={!!waitingFor && waitingFor === preparation?.id} close={() => setOpen(null)} requested={waitForPreparation} configure={() => { setOpen(null); setConfiguring(true); }} inspect={() => setOpen('work')} />}
    {(open === 'work' || open === 'ready') && !permissionReason && <ProjectWorkDialog target={target} readyPrompt={open === 'ready'} close={() => setOpen(null)} completed={value => { void feedback.success(value.status === 'terminal-focused' ? t('wl.enteredSession') : t('wl.resultSubmitted')); }} />}
  </>;
}

function PreparationConfirmation({ target, title, preparation, alreadyRequested, close, requested, configure, inspect }: {
  target: ProjectWorkSelection; title: string; preparation?: TaskPreparation; alreadyRequested: boolean; close: () => void;
  requested: (id: string) => void; configure: () => void; inspect: () => void;
}) {
  const { role, receiveState, navigate } = useDemo();
  const t = useT();
  const [plan, setPlan] = useState<ProjectWorkPlan>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const mounted = useRef(true), pending = useRef(false);
  const targetKey = JSON.stringify(target);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let active = true; setPlan(undefined); setError(''); void getProjectWork(role, JSON.parse(targetKey)).then(value => { if (active) setPlan(value); }).catch(cause => { if (active) setError(cause.message); }); return () => { active = false; }; }, [role, targetKey, reload]);
  const ongoing = !!preparation && ['importing', 'preparing-session'].includes(preparation.status);
  const pendingWork = requestPending(plan?.previous);
  const configReason = !plan ? undefined : !plan.instance.installed ? t('wl.notInstalled') : !plan.instance.agent || !plan.instance.model ? t('wl.noAgent') : plan.instance.terminal?.error;
  const cannotRetry = !!preparation && ['failed', 'waiting-directory'].includes(preparation.status) && !preparation.retryable;
  const start = async () => {
    if (pending.current || !plan || configReason || !plan.directory.valid || pendingWork || cannotRetry) return;
    pending.current = true; setBusy(true); setError('');
    try {
      // An already running job only needs a local notification intent, not another request.
      if (ongoing || alreadyRequested && preparation?.status === 'queued') { requested(preparation!.id); return; }
      const scope = { projectId: target.projectId, taskId: (target.taskId ?? target.requirementId)! };
      const next = await triggerTaskAutomation(role, scope, 'preparation', true);
      if (!mounted.current) return;
      const saved = taskAutomation(next, scope)?.preparation;
      if (!saved?.id) throw new Error(t('wl.noPreparationRecord'));
      receiveState(next); requested(saved.id);
    } catch (cause) { if (mounted.current) setError((cause as Error).message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return <Modal open centered className="project-work-modal" title={t('wl.prepareTitle')} footer={null} maskClosable={false} onCancel={close} width={560}>
    <div className="page-stack"><Typography.Text strong>{displayText(title)}</Typography.Text>
      <p>{t('wl.prepareIntro')}</p>
      <p className="muted">{t('wl.prepareNote')}</p>
      {preparation && <Alert showIcon type={preparation.status === 'failed' || preparation.status === 'waiting-directory' ? 'warning' : 'info'} title={preparationHint(preparation)} description={preparation.error && displayText(preparation.error)} />}
      {error && <Alert type="error" title={t('wl.prepareNotSubmitted')} description={displayText(error)} />}
      {!plan && !error && <Spin />}
      {plan && !plan.directory.valid && <Alert type="warning" title={t('wl.needDirectory')} description={displayText(plan.directory.diagnostic)} action={<Button disabled={busy} onClick={configure}>{t('wl.configureDirectory')}</Button>} />}
      {configReason && <Alert type="warning" title={t('wl.needConfig')} description={displayText(configReason)} action={<Button onClick={() => { close(); navigate('agent'); }}>{t('wl.openToolConfig')}</Button>} />}
      {pendingWork && <Alert type="warning" title={t('wl.pendingOriginal')} description={t('wl.pendingOriginalNote')} action={<Button onClick={inspect}>{t('wl.checkLaunchRequest')}</Button>} />}
      {cannotRetry && <Alert type="warning" title={t('wl.checkNativeRecord')} description={t('wl.checkNativeNote')} />}
      <Space><Button type="primary" aria-label={t('wl.startPreparation')} loading={busy} disabled={!plan || !!configReason || !plan.directory.valid || pendingWork || cannotRetry} onClick={() => void start()}>{t('wl.startPreparation')}</Button><Button onClick={close}>{t('common.cancel')}</Button>{error && <Button disabled={busy} onClick={() => setReload(value => value + 1)}>{t('wl.reload')}</Button>}</Space>
    </div>
  </Modal>;
}

function ProjectWorkDialog({ target, close, configureOnly = false, completed, readyPrompt = false, preparationRequested }: { target: ProjectWorkSelection; close: () => void; configureOnly?: boolean; completed?: (receipt: ProjectWorkReceipt) => void; readyPrompt?: boolean; preparationRequested?: (id: string) => void }) {
  const { state, role, navigate, showText, receiveState } = useDemo();
  const t = useT();
  const [busy, setBusy] = useState(false), [plan, setPlan] = useState<ProjectWorkPlan>(), [error, setError] = useState('');
  const [action, setAction] = useState<ProjectWorkAction>('new'), [directory, setDirectory] = useState(''), [receipt, setReceipt] = useState<ProjectWorkReceipt>();
  const [noGit, setNoGit] = useState(false);
  const [reload, setReload] = useState(0), [binding, setBinding] = useState(false);
  const key = JSON.stringify(target);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const saved = (value: ProjectWorkReceipt) => {
    // A late response belongs to the original dialog, even when the same scope
    // has since been reopened. It must not close or notify the new instance.
    if (!mounted.current) return;
    if (value.status === 'terminal-requested' || value.status === 'terminal-focused') { completed?.(value); close(); }
    else setReceipt(value);
  };
  useEffect(() => {
    let active = true; setPlan(undefined); setError(''); setReceipt(undefined);
    void getProjectWork(role, JSON.parse(key)).then(value => { if (active) { setPlan(value); setAction(value.defaultAction); setDirectory(value.directory.root ?? ''); setNoGit(value.workspace?.mode === 'directory'); } }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [role, key, reload]);
  const bind = async () => { setBinding(true); setError(''); try { const value = await bindProjectWork(role, target, directory, noGit ? 'directory' : 'auto'); if (!mounted.current) return; setPlan(value); setAction(value.defaultAction); if (configureOnly && value.directory.valid && target.taskId) { const next = await triggerTaskAutomation(role, { projectId: target.projectId, taskId: target.taskId }, 'preparation', true); if (!mounted.current) return; receiveState(next); const id = taskAutomation(next, { projectId: target.projectId, taskId: target.taskId })?.preparation?.id; if (id) preparationRequested?.(id); close(); } } catch (cause) { if (mounted.current) setError((cause as Error).message); } finally { if (mounted.current) setBinding(false); } };
  const preparedSession = target.taskId ? taskAutomation(state, { projectId: target.projectId, taskId: target.taskId })?.preparation?.session : undefined;
  const prepared = action !== 'new' && !!preparedSession?.sessionId && preparedSession.sessionId === plan?.history?.sessionId;
  const directoryForm = plan && <div className="page-stack"><p>{plan.directory.valid ? t('wl.directoryRegistered') : t('wl.directoryExplain')}</p>{plan.workspace && <p className="muted">{plan.workspace.note}</p>}<Input aria-label={t('wl.directoryAria')} placeholder={t('wl.directoryPlaceholder')} value={directory} disabled={busy || binding} onChange={event => setDirectory(event.target.value)} /><Checkbox checked={noGit} disabled={busy || binding} onChange={event => setNoGit(event.target.checked)}>{t('wl.noGitOption')}</Checkbox><Button loading={binding} disabled={busy || !directory.trim()} onClick={() => void bind()}>{noGit ? t('wl.registerDirectory') : t('wl.bindDirectory')}</Button>{!plan.directory.valid && <Collapse ghost size="small" items={[{ key: 'directory-reason', label: t('wl.directoryRequirements'), children: <p>{displayText(plan.directory.diagnostic)}</p> }]} />}</div>;
  const chosen = plan?.actions.find(item => item.id === action);
  const pendingPrevious = requestPending(plan?.previous) && !(action === 'focus' && chosen?.enabled);
  const check = () => { setReceipt(undefined); setReload(value => value + 1); };
  return <Modal className="project-work-modal" open centered zIndex={1100} title={configureOnly ? t('wl.configureDirectory') : receipt ? t('wl.resultTitle') : readyPrompt ? t('wl.readyPromptTitle') : action === 'focus' && plan?.history?.active ? t('wl.enterSession') : prepared ? t('wl.enterPreparedSession') : t('wl.launchTitle')} footer={null} maskClosable={false} closable={!busy && !binding} onCancel={close} width={640} destroyOnHidden>
      {error && <Alert type="error" title={t('wl.entryNotReady')} description={displayText(error)} action={<Button onClick={() => setReload(value => value + 1)}>{t('wl.reload')}</Button>} />}
      {!plan && !error && <Spin tip={t('wl.loadingConfig')}><div style={{ minHeight: 100 }} /></Spin>}
      {plan && configureOnly ? <>{directoryForm}<Button type="link" onClick={close}>{t('common.cancel')}</Button></> : plan && receipt ? <WorkResult prepared={prepared} plan={plan} receipt={receipt} done={close} inspect={() => showText(t('wl.thisEntry'), JSON.stringify(receipt, null, 2))} check={check} newWork={() => { setReceipt(undefined); setAction('new'); }} /> : plan && <ConfirmWork key={plan.planToken} confirmLabel={readyPrompt ? t('wl.enterSession') : action === 'focus' ? t('wl.enterSession') : action === 'resume' ? t('wl.resumeSession') : t('wl.startWork')} pendingLabel={action === 'focus' ? t('wl.switching') : t('wl.launching')} title={plan.title + ' · ' + plan.location} instance={plan.instance.name} roleLabel={action === 'new' ? plan.instance.agentLabel : plan.history?.configuration?.agentLabel} modelLabel={action === 'new' ? plan.instance.modelLabel : plan.history?.configuration?.modelLabel} disabled={!chosen?.enabled || binding || pendingPrevious} busyChanged={value => { if (mounted.current) setBusy(value); }} saved={saved} startWork={requestId => startProjectWork(role, { requestId, target: plan.target, action, planToken: plan.planToken })}>
        {pendingPrevious && <Alert type="warning" title={t('wl.previousPending')} description={t('wl.previousPendingNote')} action={<Button onClick={check}>{t('wl.recheck')}</Button>} />}
        <Descriptions size="small" column={1} items={[{ key: 'project', label: t('wl.project'), children: plan.projectName }, { key: 'task', label: t('wl.currentWork'), children: displayRequirementId([plan.target.taskId ?? plan.target.requirementId, plan.location].filter(Boolean).join(' · ')) }, { key: 'dir', label: t('wl.useDirectory'), children: action === 'new' ? plan.directory.root ?? t('wl.notBound') : plan.history?.directory }, { key: 'terminal', label: t('wl.useTerminal'), children: action === 'focus' ? plan.history?.active?.application ?? t('wl.originalTerminal') : plan.instance.terminal?.name ?? t('wl.notConfigured') }, ...(plan.workspace ? [{ key: 'workspace', label: t('wl.workspaceMode'), children: plan.workspace.mode === 'git' ? (plan.workspace.localOnly ? t('wl.localGitOnly') : t('wl.gitBranch', { branch: plan.workspace.baseBranch ?? t('wl.branchUnregistered') })) : t('wl.plainDirectory') }] : []), { key: 'context', label: t('wl.context'), children: prepared ? t('wl.contextRead') : plan.context.frozen ? t('wl.contextFrozen') : t('wl.contextNotFrozen') }]} />
        {!plan.directory.valid && directoryForm}
        <Radio.Group aria-label={t('wl.sessionAction')} value={action} disabled={busy} onChange={event => setAction(event.target.value)}><Space orientation="vertical">{plan.actions.map(item => <Radio key={item.id} value={item.id} disabled={!item.enabled}>{displayText(item.label)}{!item.enabled && <span className="muted"> · {item.reason && displayText(item.reason)}</span>}</Radio>)}</Space></Radio.Group>
        {plan.history?.diagnostic && <Alert type={plan.history.trajectory?.state === 'degraded' || !chosen?.enabled ? 'warning' : 'info'} title={plan.history.active ? t('wl.sessionRunning') : plan.history.trajectory?.state === 'degraded' ? t('wl.sessionDegraded') : t('wl.sessionStatus')} description={displayText(plan.history.diagnostic)} />}
        {action !== 'new' && plan.history && <p className="muted">{t('wl.sessionLabel', { title: plan.history.title })}</p>}
        <p className="muted">{prepared ? t('wl.bodyPrepared') : action === 'focus' ? t('wl.bodyFocus') : action === 'new' && plan.history ? t('wl.bodyNewHistory') : plan.executionMode === 'task-file' ? t('wl.bodyTaskFile') : plan.target.taskId ? t('wl.bodyWithTask') : t('wl.bodyProject')}</p>
        <Collapse className="project-work-details" ghost items={[{ key: 'technical', label: t('wl.technical'), children: <><Descriptions size="small" column={1} items={[
          { key: 'source', label: t('wl.source'), children: displayText(plan.source) },
          { key: 'context', label: t('wl.contextNote'), children: displayText(plan.context.summary) },
          { key: 'version', label: t('wl.adoptedVersions'), children: displayText(plan.context.versions) },
          ...(action !== 'new' && plan.history ? [{ key: 'session', label: t('wl.sessionId'), children: plan.history.sessionId }] : []),
          ...(plan.previous ? [{ key: 'previous', label: t('wl.previousRequest'), children: requestTime(plan.previous.at) + ' · ' + (requestPending(plan.previous) ? t('wl.previousPendingResult') : plan.previous.status === 'terminal-focused' ? t('wl.previousFocused') : t('wl.previousSubmitted')) }] : []),
        ]} />{plan.previous && <><p className="muted">{displayText(plan.previous.note)}</p><Button type="link" onClick={() => showText(t('wl.thisEntry'), JSON.stringify(plan.previous, null, 2))}>{t('wl.viewPrevious')}</Button></>}</> }]} />
        <Button type="link" onClick={() => { close(); navigate('agent'); }}>{t('wl.toolDiagnostics')}</Button>
        {readyPrompt && <Button type="link" disabled={busy} onClick={close}>{t('wl.enterLater')}</Button>}
      </ConfirmWork>}
    </Modal>;
}
