/** Adapted from team-collaboration/src/client/ui/project-real-work.tsx ConfirmWork.
 * Source revision: d3deae7ea4e47026925ccbd06ab6eec03f4648c7.
 * Keeps one request identity, pending guard, retry semantics and confirmation wording;
 * replaces host invocation with the demo's explicit project/native adapter.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import type { ProjectWorkReceipt } from '../../../project-work.js';
import { vt } from '../i18n.js';
export function ConfirmWork({ title, instance, roleLabel, modelLabel, disabled, children, startWork, saved, busyChanged, confirmLabel = vt('wl.startWork'), pendingLabel = vt('wl.launching') }: {
  title: string; instance: string; roleLabel?: string; modelLabel?: string; disabled: boolean; children?: ReactNode;
  startWork(requestId: string): Promise<ProjectWorkReceipt>; saved(receipt: ProjectWorkReceipt): void; busyChanged(busy: boolean): void;
  confirmLabel?: string; pendingLabel?: string;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [message, setMessage] = useState('');
  const pending = useRef(false), original = useRef(startWork);
  const start = async () => {
    if (pending.current) return;
    if (!attempted) original.current = startWork;
    pending.current = true; setBusy(true); busyChanged(true); setAttempted(true); setMessage('');
    try { saved(await original.current(requestId)); }
    catch (cause) { setMessage(vt('wl.startPending', { error: cause instanceof Error ? cause.message : String(cause) })); }
    finally { pending.current = false; setBusy(false); busyChanged(false); }
  };
  return <div className="page-stack"><p>{vt('wl.confirmIntro', { title })}</p><p className="muted">{vt('wl.confirmScope', { instance, role: roleLabel ?? vt('wl.notConfigured'), model: modelLabel ?? vt('wl.notConfigured') })}</p><fieldset disabled={attempted} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset><Button type="primary" aria-label={attempted ? vt('wl.retryStart') : confirmLabel} disabled={disabled || busy} loading={busy} onClick={() => void start()}>{busy ? pendingLabel : attempted ? vt('wl.retryStart') : confirmLabel}</Button>{message && <p role="alert">{message}</p>}</div>;
}
