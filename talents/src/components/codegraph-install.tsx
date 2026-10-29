// CodeGraph on this machine, on its capability card and page: 已安装 when its self-check passes, else 安装, which runs the
// install command its engine.yaml declares (server/codegraph-install.ts) after the user confirms it.
import { useEffect, useState } from 'react';
import { App, Button, Collapse, Tag, Tooltip } from 'antd';
import { codegraphEngine, installCodegraph, type CodegraphEngine } from '../api.ts';
import { useTalents } from '../store.tsx';
import { when } from '../demo/format.ts';

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
  return (engine: CodegraphEngine) => modal.confirm({
    title: '安装 CodeGraph？', okText: '安装', cancelText: '取消', width: 560,
    content: <><p>将在本机运行 CodeGraph 官方安装脚本（固定 v1.6.0）：从 GitHub 下载，安装到 <code>~/.codegraph</code>，命令入口在 <code>~/.local/bin</code>。可能需要几分钟。</p>
      <pre className="log">{engine.command}</pre></>,
    onOk: async () => {
      try {
        publish(await installCodegraph());
        const done = await follow();
        toast(done.install?.status === 'success' ? '已安装 CodeGraph ' + (done.status.version ?? '') : '安装没有成功，在 CodeGraph 详情中查看日志');
      } catch (e) { toast('无法安装：' + (e as Error).message); }
    },
  });
}

/** On the capability card: 已安装, 安装中, or the 安装 button. */
export function CodegraphInstall() {
  const engine = useEngine(), install = useInstall();
  if (!engine) return null;
  if (engine.install?.status === 'running') return <Button size="small" loading>安装中</Button>;
  if (engine.status.state === 'installed') return <Tag color="success">已安装{engine.status.version && ' ' + engine.status.version}</Tag>;
  if (!engine.command) return <Tooltip title={engine.status.detail}><Tag color="warning">未安装</Tag></Tooltip>;
  return <Tooltip title={engine.status.state === 'failed' ? engine.status.detail : '本机没有找到 codegraph'}><Button size="small" type="primary" onClick={() => install(engine)}>安装</Button></Tooltip>;
}

/** On the capability page: what the self-check says, the install command and the last install's log. */
export function CodegraphInstallDetail() {
  const engine = useEngine(), install = useInstall();
  if (!engine) return null;
  const { status, install: last } = engine, running = last?.status === 'running';
  return <div className="field"><span className="label">本机安装</span>
    <p>{running ? '正在安装…' : status.state === 'installed' ? '已安装 codegraph ' + (status.version ?? '') + '，自检通过' : status.state === 'missing' ? '未安装：本机没有找到 codegraph' : '自检没有通过'}
      <span className="caption">（检测于 {when(new Date(status.checkedAt).toISOString())}）</span></p>
    {status.state === 'failed' && status.detail && <pre className="log">{status.detail}</pre>}
    <div className="actions">
      {status.state !== 'installed' && engine.command && <Button type="primary" loading={running} onClick={() => install(engine)}>{running ? '安装中' : '安装'}</Button>}
      <Button disabled={running} onClick={() => void load(true)}>重新检测</Button>
    </div>
    {last && <Collapse size="small" defaultActiveKey={running ? ['log'] : []} items={[{ key: 'log', label: '安装日志（' + { running: '进行中', success: '成功', failed: '失败' }[last.status] + '，' + when(new Date(last.startedAt).toISOString()) + '）',
      children: <pre className="log">{last.logs.join('\n')}</pre> }]} />}
  </div>;
}
