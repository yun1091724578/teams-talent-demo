import { useState } from 'react';
import { Alert, Button, Collapse, Space, Tag, Timeline } from 'antd';
import { triggerTaskAutomation } from '../api.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { displayText } from '../display-text.js';
import { taskAutomation, type TaskAutomation, type TaskScope } from '../task-automation.js';
import { taskExecutableBy } from '../task-visibility.js';

type Preparation = NonNullable<TaskAutomation['preparation']>;
const preparationKeys: Record<Preparation['status'], MessageKey> = {
  queued: 'pr.queued', importing: 'pr.importing', 'preparing-session': 'pr.preparingSession', ready: 'pr.ready', 'waiting-directory': 'pr.waitingDirectory', failed: 'pr.failed',
};
export const preparationLabels: Record<Preparation['status'], string> = {
  queued: currentT('pr.queued'), importing: currentT('pr.importing'), 'preparing-session': currentT('pr.preparingSession'), ready: currentT('pr.ready'), 'waiting-directory': currentT('pr.waitingDirectory'), failed: currentT('pr.failed'),
};
export const preparationReady = (preparation?: Preparation) => !!preparation && preparation.status === 'ready' && preparation.session?.status === 'ready' && !!preparation.session.sessionId && preparation.session.readEvidence.length > 0;
export const preparationStatusLabel = (preparation: Preparation) => preparation.status === 'ready' && !preparationReady(preparation) ? currentT('pr.checkingSession') : currentT(preparationKeys[preparation.status]);
export const preparationHint = (preparation: Preparation) => preparation.status === 'ready'
  ? preparationReady(preparation) ? currentT('pr.hintReadyOk') : currentT('pr.hintChecking')
  : preparation.status === 'waiting-directory' ? currentT('pr.hintDirectory')
  : preparation.status === 'failed' ? currentT('pr.hintFailed')
  : preparation.status === 'preparing-session' ? currentT('pr.hintPreparing')
  : preparation.status === 'importing' ? currentT('pr.hintImporting')
  : preparation.assigneeId ? currentT('pr.hintAssigned') : currentT('pr.hintUnassigned');

export function TaskPreparationProgress({ scope }: { scope: TaskScope }) {
  const { state, role, receiveState } = useDemo();
  const t = useT();
  const preparation = taskAutomation(state, scope)?.preparation;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!preparation) return null;
  const canRetry = preparation.retryable && (role === 'owner' || taskExecutableBy(role, preparation.assigneeId));
  return <div className="task-preparation-progress" data-preparation-task={scope.taskId} aria-live="polite">
    <Space wrap><Tag color={preparationReady(preparation) ? 'green' : preparation.status === 'failed' ? 'orange' : undefined}>{preparationStatusLabel(preparation)}</Tag><span className="muted">{preparationHint(preparation)}</span></Space>
    {preparation.progress.length > 0 && <Timeline items={preparation.progress.map((entry, index) => ({ key: entry.at + ':' + index, color: entry.status === 'failed' ? 'orange' : entry.status === 'completed' ? 'green' : 'blue', content: <div><p>{displayText(entry.summary)}</p><p className="muted">{entry.phase === 'knowledge' ? t('pr.phaseKnowledge') : t('pr.phaseSession')} · {new Date(entry.at).toLocaleString('zh-CN')}</p></div> }))} />}
    {preparation.error && <Collapse ghost size="small" items={[{ key: 'failure', label: t('pr.viewCause'), children: <p>{displayText(preparation.error)}</p> }]} />}
    {error && <Alert type="error" title={t('pr.retryFailed')} description={error} />}
    {canRetry && preparation.status === 'failed' && <Button size="small" loading={busy} onClick={async () => { if (busy) return; setBusy(true); setError(''); try { receiveState(await triggerTaskAutomation(role, scope, 'preparation', true)); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>{t('pr.retry')}</Button>}
  </div>;
}
