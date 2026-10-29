// CodeGraph on this machine, on its capability card and page: 已安装 when its self-check passes, else 安装, which runs the
// install command its engine.yaml declares (server/codegraph-install.ts) after the user confirms it.
import { useEffect, useState } from 'react';
import { App, Button, Collapse, Tag, Tooltip } from 'antd';
import { codegraphEngine, installCodegraph, type CodegraphEngine } from '../api.ts';
import { useTalents } from '../store.tsx';
import { when } from '../demo/format.ts';
import { useT } from '../i18n.tsx';

// One state for every place that shows it; checked once per page load (and again on request), polled while installing.
let current: CodegraphEngine | undefined, loading: Promise<void> | null = null;
const shown = new Set<(engine: CodegraphEngine) => void>();
const publish = (engine: CodegraphEngine) => { current = engine; shown.forEach(set => set(engine)); };
const load = (check = false) => loading ??= codegraphEngine(check).then(publish, () => undefined).finally(() => { loading = null; });
async function follow() {
  while (current?.install?.status === 'running') {
    await new Promise(done => setTimeout(done, 1000));
    try { publish(await codegraphEngine()); } catch { /* the service is restarting: try again */ }
  }
  return current!;
}

function useEngine() {
  const [engine, setEngine] = useState(current);
  useEffect(() => { shown.add(setEngine); if (!current) void load(true); else if (current.install?.status === 'running') void follow(); return () => { shown.delete(setEngine); }; }, []);
  return engine;
}
function useInstall() {
  const { toast } = useTalents();
  const { modal } = App.useApp();
  const t = useT();
  return (engine: CodegraphEngine) => modal.confirm({
    title: t('cgi.confirmTitle'), okText: t('cgi.install'), cancelText: t('common.cancel'), width: 560,
    content: <><p>{t('cgi.confirmBodyBefore')} <code>~/.codegraph</code>{t('cgi.confirmBodyMiddle')} <code>~/.local/bin</code>{t('cgi.confirmBodyAfter')}</p>
      <pre className="log">{engine.command}</pre></>,
    onOk: async () => {
      try {
        publish(await installCodegraph());
        const done = await follow();
        toast(done.install?.status === 'success' ? t('cgi.installedVersion', { version: done.status.version ?? '' }) : t('cgi.installFailed'));
      } catch (e) { toast(t('cgi.installError', { error: (e as Error).message })); }
    },
  });
}

/** On the capability card: 已安装, 安装中, or the 安装 button. */
export function CodegraphInstall() {
  const t = useT();
  const engine = useEngine(), install = useInstall();
  if (!engine) return null;
  if (engine.install?.status === 'running') return <Button size="small" loading>{t('cgi.installing')}</Button>;
  if (engine.status.state === 'installed') return <Tag color="success">{t('cgi.installed')}{engine.status.version && ' ' + engine.status.version}</Tag>;
  if (!engine.command) return <Tooltip title={engine.status.detail}><Tag color="warning">{t('cgi.notInstalled')}</Tag></Tooltip>;
  return <Tooltip title={engine.status.state === 'failed' ? engine.status.detail : t('cgi.missingLocal')}><Button size="small" type="primary" onClick={() => install(engine)}>{t('cgi.install')}</Button></Tooltip>;
}

/** On the capability page: what the self-check says, the install command and the last install's log. */
export function CodegraphInstallDetail() {
  const t = useT();
  const engine = useEngine(), install = useInstall();
  if (!engine) return null;
  const { status, install: last } = engine, running = last?.status === 'running';
  return <div className="field"><span className="label">{t('cgi.localInstall')}</span>
    <p>{running ? t('cgi.installingDots') : status.state === 'installed' ? t('cgi.installedSelfCheck', { version: status.version ?? '' }) : status.state === 'missing' ? t('cgi.missingDetail') : t('cgi.selfCheckFailed')}
      <span className="caption">{t('cgi.checkedAt', { time: when(new Date(status.checkedAt).toISOString()) })}</span></p>
    {status.state === 'failed' && status.detail && <pre className="log">{status.detail}</pre>}
    <div className="actions">
      {status.state !== 'installed' && engine.command && <Button type="primary" loading={running} onClick={() => install(engine)}>{running ? t('cgi.installing') : t('cgi.install')}</Button>}
      <Button disabled={running} onClick={() => void load(true)}>{t('cgi.recheck')}</Button>
    </div>
    {last && <Collapse size="small" defaultActiveKey={running ? ['log'] : []} items={[{ key: 'log', label: t('cgi.logLabel', { status: t(last.status === 'running' ? 'cgi.logRunning' : last.status === 'success' ? 'cgi.logSuccess' : 'cgi.logFailed'), time: when(new Date(last.startedAt).toISOString()) }),
      children: <pre className="log">{last.logs.join('\n')}</pre> }]} />}
  </div>;
}
