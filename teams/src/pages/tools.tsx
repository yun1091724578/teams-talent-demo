import { TaskSessions } from '../components/task-sessions.js';
import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Space, Tag } from 'antd';
import { CheckCircleOutlined, CodeOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { serverText } from '../task-labels-en.js';
import { getEngineLocation, getTools, native, type NativeStatus } from '../api.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { Origin, Mono } from '../components/common.js';
import { AgentManagement } from '../components/agent-management.js';

export function NativeControls({ compact = false }: { compact?: boolean }) {
  const { role, run, state, showText } = useDemo();
  const t = useT();
  const [status, setStatus] = useState<NativeStatus>(), [pending, setPending] = useState(''), [error, setError] = useState(''), [receipt, setReceipt] = useState<any>(null);
  useEffect(() => { let live = true; getTools().then(s => { if (live) setStatus(s); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  const launch = async () => {
    setPending('start'); setError('');
    try { setReceipt(await native(role, 'launch', { tool: 'icode', restore: false, requestId: crypto.randomUUID() })); }
    catch (e) { setError((e as Error).message); } finally { setPending(''); }
  };
  const context = async () => { await run(async () => { const value = await native(role, 'context'); showText(t('tools.contextExportedTitle'), t('tools.contextExportedBody', { path: value.path, prompt: value.prompt, content: value.content })); }); };
  const copyContext = async () => { await run(async () => { const value = await native(role, 'context'); await navigator.clipboard.writeText(value.prompt); }, t('tools.contextCopied')); };
  return <div className="native-controls">
    {!compact && <Descriptions column={1} size="small" items={[
      { key: 'version', label: t('tools.instance'), children: status?.icode.version ?? t('tools.probing') },
      { key: 'source', label: t('tools.discovery'), children: status?.icode.source === 'official' ? t('tools.discovery.official') : status?.icode.source === 'override' ? t('tools.discovery.override') : status?.icode.source === 'uv' ? t('tools.discovery.uv') : status?.icode.source === 'pipx' ? t('tools.discovery.pipx') : status?.icode.source === 'path' ? t('tools.discovery.path') : status?.icode.source === 'bundled' ? t('tools.discovery.bundled') : status?.icode.source === 'missing' ? t('tools.discovery.missing') : t('tools.probing') },
      { key: 'directory', label: t('tools.workdir'), children: <Mono>{status ? status.icode.workspace ?? t('tools.noWorkdir') : t('tools.reading')}</Mono> },
    ]} />}
    {status?.workspaceError && <Alert type="info" title={t('tools.workdirRequired')} description={serverText(status.workspaceError)} />}
    {!!status?.icode.notes?.length && <Alert type="warning" title={t('tools.probeNotes')} description={status.icode.notes.join(t('common.listSeparator'))} />}
    <Space wrap><Button type="primary" icon={<CodeOutlined />} loading={pending === 'start'} disabled={!status?.icode.installed || !status.icode.workspace || !!pending} onClick={() => void launch()}>{t('tools.launch')}</Button><Button onClick={() => { setError(''); void getEngineLocation().then(value => showText('chrys.engine.locate', JSON.stringify(value, null, 2))).catch(e => setError((e as Error).message)); }}>{t('tools.engine')}</Button>{state.context && <><Button onClick={() => void context()}>{t('tools.exportContext')}</Button><Button onClick={() => void copyContext()}>{t('tools.copyContext')}</Button></>}</Space>
    {error && <Alert type="error" title={t('tools.failed')} description={error} showIcon />}
    {receipt && <Alert type="success" showIcon title={t('tools.requested', { terminal: receipt.terminal ?? t('tools.localTerminal') })} description={receipt.note} />}
    <p className="muted native-note">{t('tools.note')}</p>
  </div>;
}

export function Tools() {
  return <AgentManagement nativeControls={<NativeControls />} />;
}

export function SessionReporting(){ const t = useT(); return <div className="page-stack"><TaskSessions readonly/><FrameworkCard title={t('tools.developmentTools')} action={<Origin kind="native"/>}><NativeControls compact/></FrameworkCard></div>; }
