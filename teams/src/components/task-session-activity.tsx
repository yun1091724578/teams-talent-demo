import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Select, Space, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { streamNote } from '../display-text.js';
import { getTaskSessionStream } from '../api.js';
import type { RequirementNode } from '../delivery-requirements.js';
import './task-session-activity.css';

type Stream = Awaited<ReturnType<typeof getTaskSessionStream>>;
type Turn = Stream['turns'][number];

/** Read-only conversation polling never advances business task progress. */
export function TaskSessionActivity({ projectId, taskId, nodeId, sessionId, showSessionSelector = true, readonlySource = false }: { projectId: string; taskId: string; nodeId: RequirementNode; sessionId?: string; showSessionSelector?: boolean; readonlySource?: boolean }) {
  const { role } = useDemo(), scopeKey = [role, projectId, taskId, nodeId].join(':');
  const t = useT();
  const statusLabels = { running: t('tsa.stRunning'), completed: t('tsa.stCompleted'), failed: t('tsa.stFailed'), unavailable: t('tsa.stUnavailable'), unknown: t('tsa.stUnknown') };
  const turnStatus = { running: t('tsa.turnRunning'), ended: t('tsa.turnEnded'), failed: t('tsa.turnFailed'), unknown: t('tsa.turnUnknown') };
  const nodeLabels: Record<RequirementNode, string> = { prepare: t('phase.preparing'), develop: t('phase.developing'), verify: t('phase.verifying'), accept: t('ter.accept') };
  const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : t('tsa.timeMissing');
  const [chosen, setChosen] = useState<{ scope: string; id: string }>();
  const selection = chosen?.scope === scopeKey ? chosen.id : sessionId;
  useEffect(() => { setChosen(sessionId ? { scope: scopeKey, id: sessionId } : undefined); }, [sessionId, scopeKey]);
  const [stream, setStream] = useState<Stream>();
  const [turns, setTurns] = useState<Turn[]>([]), [error, setError] = useState(''), [pending, setPending] = useState(true), [hasNew, setHasNew] = useState(false);
  const viewport = useRef<HTMLDivElement>(null), following = useRef(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (readonlySource) return;
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, cursor: string | undefined, currentSession: string | null = null;
    const observed = new Map<string, Turn>();
    setStream(undefined); setTurns([]); setError(''); setPending(true); setHasNew(false); following.current = true;
    const poll = async () => {
      if (document.hidden) { timer = setTimeout(poll, 2000); return; }
      let delay = 2000;
      try {
        const value = await getTaskSessionStream(role, { projectId, taskId, nodeId, ...((selection ?? currentSession) ? { sessionId: (selection ?? currentSession)! } : {}), ...(cursor ? { cursor } : {}) });
        if (!live) return;
        const reset = value.reset || value.selectedSessionId !== currentSession;
        const previous = new Map(observed);
        if (reset) observed.clear();
        let changed = false;
        for (const turn of value.turns) { if (JSON.stringify(previous.get(turn.id)) !== JSON.stringify(turn)) changed = true; observed.set(turn.id, turn); }
        currentSession = value.selectedSessionId; cursor = value.cursor ?? undefined;
        setStream(value); setTurns([...observed.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))); setError(''); setPending(false);
        if (!following.current && changed) setHasNew(true);
        if (following.current) requestAnimationFrame(() => { if (live && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; });
        delay = value.hasMore ? 100 : Math.max(1000, value.pollAfterMs);
      } catch (cause) { if (!live) return; setError((cause as Error).message); setPending(false); }
      if (live) timer = setTimeout(poll, delay);
    };
    void poll();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [projectId, taskId, nodeId, role, selection, retry, readonlySource]);
  if (readonlySource) return <section className="task-session-activity" aria-label={t('tsa.title')}><div className="task-session-activity-heading"><h3>{t('tsa.title')}</h3><Tag>{t('tsa.sourceRecord')}</Tag></div><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tsa.sourceIncomplete')} /></section>;
  const selected = stream?.sessions.find(item => item.id === stream.selectedSessionId);
  const health = selected?.trajectory;
  const bottom = () => { following.current = true; setHasNew(false); if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; };
  return <section className="task-session-activity" aria-label={t('tsa.title')} data-stream-task={taskId} data-stream-node={nodeId}>
    <div className="task-session-activity-heading"><h3>{t('tsa.title')}</h3><Space size={6} wrap><Tag>{error ? t('tsa.disconnected') : pending ? t('tsa.connecting') : t('tsa.connected')}</Tag>{selected && <Tag>{statusLabels[selected.status]}</Tag>}{health?.state === 'degraded' && <Tag color="orange">{t('tsa.degraded')}</Tag>}</Space></div>
    {showSessionSelector && stream?.sessions.length ? <Select className="task-session-selector" aria-label={t('tsa.selectSession')} value={stream.selectedSessionId ?? undefined} options={stream.sessions.map(item => ({ value: item.id, label: item.title + ' · ' + statusLabels[item.status] }))} onChange={id => { setStream(undefined); setTurns([]); setPending(true); setHasNew(false); setChosen({ scope: scopeKey, id }); }} /> : null}
    {error && <Alert type="warning" showIcon title={t('tsa.readFailed')} description={error} action={<Button size="small" onClick={() => setRetry(value => value + 1)}>{t('tsa.retry')}</Button>} />}
    {health?.state === 'degraded' && <Alert type="warning" showIcon title={t('tsa.degradedTitle')} description={health.diagnostic ?? t('tsa.degradedDesc')} action={<Button size="small" onClick={() => setRetry(value => value + 1)}>{t('tsa.reload')}</Button>} />}
    {health?.state === 'recovering' && <Alert type="info" showIcon title={t('tsa.recoveringTitle')} description={health.diagnostic ?? t('tsa.recoveringDesc')} />}
    {stream?.note && <p className="muted task-session-note">{streamNote(stream.note)}</p>}
    {selected?.note && <p className="muted task-session-note">{selected.note}</p>}
    <div className="task-session-events" ref={viewport} onScroll={() => { const element = viewport.current; if (element) { following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; if (following.current) setHasNew(false); } }}>
      {turns.length ? turns.map(turn => <article className="task-session-turn" key={turn.id} data-session-turn={turn.id} data-event-session={turn.sessionId}>
        <header><strong>{turn.round === null ? t('tsa.roundUnrecorded') : t('tsa.round', { round: turn.round })}</strong><span>{turnStatus[turn.status]} · <time>{time(turn.startedAt)}</time></span></header>
        <div className="task-turn-user"><h4>{t('tsa.userInput')}</h4>{turn.user ? <p data-session-message={turn.user.id} data-message-role="user">{turn.user.text}</p> : <p className="muted">{turn.userSourceNode && turn.userSourceNode !== nodeId ? t('tsa.inputElsewhere', { node: nodeLabels[turn.userSourceNode] }) : t('tsa.inputIncomplete')}</p>}</div>
        <div className="task-turn-replies"><h4>{t('tsa.modelReplies')}</h4>{turn.replies.length ? turn.replies.map(reply => <div key={reply.id} data-session-message={reply.id} data-message-role="assistant"><time>{time(reply.at)}</time><p>{reply.text}</p></div>) : <p className="muted">{turn.status === 'running' ? t('tsa.waitingReply') : t('tsa.noReplies')}</p>}</div>
        {turn.note && <p className="muted task-session-note">{turn.note}</p>}
      </article>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={pending ? t('tsa.readingConversation') : selected ? selected.status === 'running' ? t('tsa.waitingInput') : t('tsa.noConversation') : t('tsa.noSession')} />}
    </div>
    {hasNew && <Button size="small" className="task-session-new-events" onClick={bottom}>{t('tsa.newEvents')}</Button>}
    <p className="muted task-session-refresh">{stream ? t('tsa.lastRead', { time: time(stream.observedAt) }) : t('tsa.readonlyScope')}</p>
  </section>;
}
